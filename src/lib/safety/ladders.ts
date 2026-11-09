// Health & safety → Ladders: the reminder emails. Each ladder in an email
// has an "Inspect now" link to the inspection form (no sign-in - signed
// for that person, lib/safety/ladderLinks.ts), which records straight into
// the register. They go to whoever the ladder is kept with (their ladders
// only) and to the supervisors (every ladder; and anyone else who's ticked
// it on the Notifications page).
//  - sendLadderInspectionAlerts: the 7am daily run - ladders that have just
//    gone overdue, have never been inspected, or were tagged out. Each is
//    mentioned once per stage (hub_alert_log).
//  - sendLadderReminderNow: an admin's "Resend" - one ladder, or everything
//    that currently needs inspecting, whether or not it's been sent before.
// See supabase/safety_ladders.sql.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { notificationRecipients } from "@/lib/notifications/recipients";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { ladderLink, LINK_VALID_DAYS } from "./ladderLinks";
import { CHECKS, describeLadder, dueState, fmtDay, latestInspections, nextDue, type Ladder, type LadderInspection } from "./laddersShared";

export * from "./laddersShared";

type Kind = "tagged_out" | "overdue" | "requested";
type Item = { key: string; ladderId: string; line: string; kind: Kind; holderId: string | null };
type Person = { id: string; email: string | null; full_name: string };

async function loadRegister() {
  const db = createAdminClient();
  const [{ data: ladders, error }, { data: inspections }, { data: people }] = await Promise.all([
    db.from("ladders").select("*").neq("status", "retired").returns<Ladder[]>(),
    db.from("ladder_inspections").select("*").returns<LadderInspection[]>(),
    db.from("profiles").select("id, email, full_name").eq("is_active", true).is("deleted_at", null).returns<Person[]>(),
  ]);
  return { db, error, ladders: ladders ?? [], latest: latestInspections(inspections ?? []), people: people ?? [] };
}

// What the email says about a ladder that needs attention, or null if it's fine.
function itemFor(l: Ladder, last: LadderInspection | undefined, today: string): Item | null {
  const name = `${l.asset_no} (${describeLadder(l)}${l.location ? `, ${l.location}` : ""})`;
  const base = { ladderId: l.id, holderId: l.assigned_to };
  if (l.status === "tagged_out") {
    const failed = last?.result === "fail" ? CHECKS.filter((c) => last.checks?.[c.key] === "fail").map((c) => c.label) : [];
    return {
      ...base,
      key: `ladder_tagged_out:${l.id}:${last?.id ?? "manual"}`,
      line: `${name}: tagged out${last?.result === "fail" ? ` ${fmtDay(last.inspected_on)}` : ""}${failed.length ? ` - ${failed.join(", ")}` : ""}${last?.notes ? ` - ${last.notes}` : ""}`,
      kind: "tagged_out",
    };
  }
  const state = dueState(l, last, today);
  if (state === "never") return { ...base, key: `ladder_never:${l.id}`, line: `${name}: never inspected`, kind: "overdue" };
  if (state === "overdue") {
    const due = nextDue(l, last)!;
    return { ...base, key: `ladder_overdue:${l.id}:${due}`, line: `${name}: inspection was due ${fmtDay(due)}`, kind: "overdue" };
  }
  return null;
}

// Sends each person their list - supervisors everything, the person a
// ladder is kept with theirs - with links signed for them. True if any went.
async function sendToPeople(items: Item[], people: Person[], origin: string): Promise<boolean> {
  const managerEmails = new Set((await notificationRecipients("ladder_inspection")).map((e) => e.toLowerCase()));
  const lists = new Map<string, { person: Person; items: Item[] }>();
  for (const p of people) {
    if (!p.email?.trim()) continue;
    const mine = managerEmails.has(p.email.trim().toLowerCase()) ? items : items.filter((i) => i.holderId === p.id);
    if (mine.length) lists.set(p.id, { person: p, items: mine });
  }
  let sent = false;
  for (const { person, items: list } of lists.values()) {
    const links = new Map<string, string>();
    for (const i of list) links.set(i.ladderId, await ladderLink(origin, i.ladderId, person.id));
    const r = await sendEmail({ to: person.email!.trim(), fromName: "The Hub", ...ladderEmail(person, list, links, origin) });
    if (r.sent) sent = true;
  }
  return sent;
}

export async function sendLadderInspectionAlerts(origin: string): Promise<{ sent: number }> {
  const { db, error, ladders, latest, people } = await loadRegister();
  // Not set up yet (supabase/safety_ladders.sql not run).
  if (error) return { sent: 0 };
  const today = nzTodayDateString();

  const items: Item[] = [];
  for (const l of ladders) {
    const item = itemFor(l, latest.get(l.id), today);
    if (!item) continue;
    const { data: done } = await db.from("hub_alert_log").select("key").eq("key", item.key).maybeSingle();
    if (!done) items.push(item);
  }
  if (!items.length) return { sent: 0 };
  if (!(await sendToPeople(items, people, origin))) return { sent: 0 };
  await db.from("hub_alert_log").upsert(
    items.map((i) => ({ key: i.key, detail: i.line })),
    { onConflict: "key", ignoreDuplicates: true },
  );
  return { sent: items.length };
}

// An admin's resend. With a ladder: that ladder, even if it isn't due yet
// ("please inspect"). Without: every ladder that currently needs
// inspecting or is tagged out.
export async function sendLadderReminderNow(origin: string, ladderId?: string): Promise<{ sent: number; error?: string }> {
  const { error, ladders, latest, people } = await loadRegister();
  if (error) return { sent: 0, error: error.message };
  const today = nzTodayDateString();
  let items: Item[];
  if (ladderId) {
    const l = ladders.find((x) => x.id === ladderId);
    if (!l) return { sent: 0, error: "That ladder isn't in service." };
    const due = nextDue(l, latest.get(l.id));
    items = [
      itemFor(l, latest.get(l.id), today) ?? {
        key: `ladder_requested:${l.id}`,
        ladderId: l.id,
        holderId: l.assigned_to,
        line: `${l.asset_no} (${describeLadder(l)}${l.location ? `, ${l.location}` : ""}): please inspect${due ? ` - next due ${fmtDay(due)}` : ""}`,
        kind: "requested",
      },
    ];
  } else {
    items = ladders.map((l) => itemFor(l, latest.get(l.id), today)).filter((i): i is Item => i !== null);
    if (!items.length) return { sent: 0, error: "No ladders need inspecting right now." };
  }
  if (!(await sendToPeople(items, people, origin))) return { sent: 0, error: "Nobody to send it to - check the supervisors' and the ladder holder's emails on the Users page." };
  return { sent: items.length };
}

function ladderEmail(person: Person, items: Item[], links: Map<string, string>, origin: string): { subject: string; text: string; html: string } {
  const out = items.filter((i) => i.kind === "tagged_out");
  const overdue = items.filter((i) => i.kind === "overdue");
  const requested = items.filter((i) => i.kind === "requested");
  const first = person.full_name.trim().split(/\s+/)[0] || "there";
  const section = (title: string, list: Item[]) =>
    list.length ? [title, ...list.map((i) => `  • ${i.line}\n    Inspect now: ${links.get(i.ladderId)}`), ""] : [];
  const button = (href: string) =>
    `<a href="${href}" style="display:inline-block;margin-top:4px;padding:6px 12px;border-radius:6px;background:#1F4E8C;color:#fff;font-weight:bold;text-decoration:none">Inspect now</a>`;
  const htmlSection = (title: string, list: Item[], colour: string) =>
    list.length
      ? `<p style="margin:16px 0 6px;font-weight:bold;color:${colour}">${title}</p><ul style="margin:0;padding-left:18px">${list
          .map((i) => `<li style="margin-bottom:10px">${escape(i.line)}<br>${button(links.get(i.ladderId)!)}</li>`)
          .join("")}</ul>`
      : "";
  const total = items.length;
  const subject = requested.length && total === 1
    ? `Please inspect ladder ${requested[0].line.split(" (")[0]}`
    : out.length && overdue.length
      ? `Ladders: ${out.length} tagged out, ${overdue.length} need inspecting`
      : out.length
        ? `Ladder tagged out: ${out.length === 1 ? out[0].line.split(" (")[0] : `${out.length} ladders`}`
        : `Ladder inspection due: ${total === 1 ? items[0].line.split(" (")[0] : `${total} ladders`}`;
  const text = [
    `Hi ${first},`,
    "",
    ...section("Please inspect:", requested),
    ...section("Tagged out - do not use:", out),
    ...section("Need inspecting:", overdue),
    `Tap "Inspect now" to fill in the check on your phone - it goes straight into the ladder register. The links work for ${LINK_VALID_DAYS} days.`,
    `Ladder register: ${origin}/safety/ladders`,
  ].join("\n");
  const html = `<p>Hi ${escape(first)},</p>${htmlSection("Please inspect", requested, "#1F4E8C")}${htmlSection("Tagged out - do not use", out, "#B91C1C")}${htmlSection("Need inspecting", overdue, "#B91C1C")}
<p style="margin-top:16px">Tap <b>Inspect now</b> to fill in the check on your phone - it goes straight into the ladder register. The links work for ${LINK_VALID_DAYS} days.</p>
<p><a href="${origin}/safety/ladders">Ladder register</a></p>`;
  return { subject, text, html };
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
