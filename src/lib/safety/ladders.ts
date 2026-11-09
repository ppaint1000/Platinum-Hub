// Health & safety → Ladders: the morning email (from the 7am daily run)
// listing ladders that have just gone overdue for inspection, have never
// been inspected, or were tagged out by a failed check. Each is mentioned
// once per stage (hub_alert_log). Goes to the supervisors, and to whoever
// each ladder is kept with (Kept at). See supabase/safety_ladders.sql.
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { notificationRecipients } from "@/lib/notifications/recipients";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { CHECKS, describeLadder, dueState, fmtDay, latestInspections, nextDue, type Ladder, type LadderInspection } from "./laddersShared";

export * from "./laddersShared";

export async function sendLadderInspectionAlerts(origin: string): Promise<{ sent: number }> {
  const db = createAdminClient();
  const [{ data: ladders, error }, { data: inspections }, { data: people }] = await Promise.all([
    db.from("ladders").select("*").neq("status", "retired").returns<Ladder[]>(),
    db.from("ladder_inspections").select("*").returns<LadderInspection[]>(),
    db.from("profiles").select("id, email").eq("is_active", true).is("deleted_at", null).returns<{ id: string; email: string | null }[]>(),
  ]);
  // Not set up yet (supabase/safety_ladders.sql not run).
  if (error) return { sent: 0 };
  const latest = latestInspections(inspections ?? []);
  const emailOf = new Map((people ?? []).map((p) => [p.id, p.email?.trim() || null]));
  const today = nzTodayDateString();

  const items: Item[] = [];
  for (const l of ladders ?? []) {
    const last = latest.get(l.id);
    const name = `${l.asset_no} (${describeLadder(l)}${l.location ? `, ${l.location}` : ""})`;
    let key: string;
    let line: string;
    let kind: Item["kind"];
    if (l.status === "tagged_out") {
      const failed = last?.result === "fail" ? CHECKS.filter((c) => last.checks?.[c.key] === "fail").map((c) => c.label) : [];
      key = `ladder_tagged_out:${l.id}:${last?.id ?? "manual"}`;
      line = `${name}: tagged out${last?.result === "fail" ? ` ${fmtDay(last.inspected_on)}` : ""}${failed.length ? ` - ${failed.join(", ")}` : ""}${last?.notes ? ` - ${last.notes}` : ""}`;
      kind = "tagged_out";
    } else {
      const state = dueState(l, last, today);
      if (state === "never") {
        key = `ladder_never:${l.id}`;
        line = `${name}: never inspected`;
      } else if (state === "overdue") {
        const due = nextDue(l, last)!;
        key = `ladder_overdue:${l.id}:${due}`;
        line = `${name}: inspection was due ${fmtDay(due)}`;
      } else continue;
      kind = "overdue";
    }
    const { data: done } = await db.from("hub_alert_log").select("key").eq("key", key).maybeSingle();
    if (!done) items.push({ key, line, kind, holder: l.assigned_to ? emailOf.get(l.assigned_to) ?? null : null });
  }
  if (!items.length) return { sent: 0 };

  // The supervisors (and anyone else who's ticked it on the Notifications
  // page) get every ladder; whoever a ladder is kept with gets theirs.
  const managers = await notificationRecipients("ladder_inspection");
  const managerSet = new Set(managers.map((e) => e.toLowerCase()));
  const batches: { to: string; list: Item[] }[] = [];
  if (managers.length) batches.push({ to: managers.join(", "), list: items });
  const byHolder = new Map<string, Item[]>();
  for (const i of items) {
    if (!i.holder || managerSet.has(i.holder.toLowerCase())) continue;
    byHolder.set(i.holder, [...(byHolder.get(i.holder) ?? []), i]);
  }
  for (const [to, list] of byHolder) batches.push({ to, list });
  if (!batches.length) return { sent: 0 };

  let sent = false;
  for (const b of batches) {
    const r = await sendEmail({ to: b.to, fromName: "The Hub", ...ladderEmail(b.list, origin) });
    if (r.sent) sent = true;
  }
  if (!sent) return { sent: 0 };
  await db.from("hub_alert_log").upsert(
    items.map((i) => ({ key: i.key, detail: i.line })),
    { onConflict: "key", ignoreDuplicates: true },
  );
  return { sent: items.length };
}

type Item = { key: string; line: string; kind: "tagged_out" | "overdue"; holder: string | null };

function ladderEmail(items: Item[], origin: string): { subject: string; text: string; html: string } {
  const out = items.filter((i) => i.kind === "tagged_out");
  const overdue = items.filter((i) => i.kind === "overdue");
  const section = (title: string, list: Item[]) => (list.length ? [title, ...list.map((i) => `  • ${i.line}`), ""] : []);
  const htmlSection = (title: string, list: Item[]) =>
    list.length
      ? `<p style="margin:12px 0 4px;font-weight:bold;color:#B91C1C">${title}</p><ul style="margin:0">${list.map((i) => `<li>${escape(i.line)}</li>`).join("")}</ul>`
      : "";
  const subject =
    out.length && overdue.length
      ? `Ladders: ${out.length} tagged out, ${overdue.length} need inspecting`
      : out.length
        ? `Ladder tagged out: ${out.length === 1 ? out[0].line.split(" (")[0] : `${out.length} ladders`}`
        : `Ladder inspection overdue: ${overdue.length === 1 ? overdue[0].line.split(" (")[0] : `${overdue.length} ladders`}`;
  const text = [
    ...section("Tagged out - do not use:", out),
    ...section("Need inspecting:", overdue),
    `Record inspections in Health & safety → Ladders: ${origin}/safety/ladders`,
  ].join("\n");
  const html = `${htmlSection("Tagged out - do not use", out)}${htmlSection("Need inspecting", overdue)}
<p style="margin-top:16px">Record inspections in <a href="${origin}/safety/ladders">Health &amp; safety → Ladders</a>.</p>`;
  return { subject, text, html };
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
