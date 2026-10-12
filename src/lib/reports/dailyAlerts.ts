// "Something's not right" alerts - checked every working morning at 7am
// (/api/cron/daily) and emailed to admins as one digest (Notifications:
// "Daily alerts"). Each alert is sent once (hub_alert_log), so the same
// problem isn't repeated every day.
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { notificationRecipients } from "@/lib/notifications/recipients";
import { addDays, mondayOf, nzDateKey, nzTimeString, nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { fetchVariations, LIVE_STATUSES, variationTotals, groupBy } from "@/lib/jobs/jobFinance";

type Alert = { key: string; title: string; detail: string; link: string };

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-NZ");

async function findAlerts(origin: string): Promise<Alert[]> {
  const db = createAdminClient();
  const today = nzTodayDateString();
  const weekAgo = addDays(today, -7);
  const alerts: Alert[] = [];

  const [{ data: requests }, { data: jobs }, { data: openShifts }] = await Promise.all([
    db.from("requests").select("created_at").gte("created_at", `${weekAgo}T00:00:00Z`),
    db
      .from("jobs")
      .select("id, job_number, name, status, quoted_at, won_at, lost_at, completed_at, quoted_sell_total")
      .returns<
        {
          id: string;
          job_number: string | null;
          name: string;
          status: string;
          quoted_at: string | null;
          won_at: string | null;
          lost_at: string | null;
          completed_at: string | null;
          quoted_sell_total: number | null;
        }[]
      >(),
    db
      .from("timesheet_entries")
      .select("id, clock_in_at, profiles(full_name), sites(name)")
      .is("clock_out_at", null)
      .lt("clock_in_at", new Date(Date.now() - 12 * 3600 * 1000).toISOString()),
  ]);
  const all = jobs ?? [];
  const label = (j: { job_number: string | null; name: string }) => (j.job_number ? `${j.job_number} ${j.name}` : j.name);

  // 1. Nothing new coming in.
  const newQuotes = all.filter((j) => j.quoted_at && j.quoted_at.slice(0, 10) >= weekAgo).length;
  if ((requests ?? []).length === 0 && newQuotes === 0) {
    alerts.push({
      key: `no_leads:${mondayOf(today)}`,
      title: "No new enquiries or quotes in the last 7 days",
      detail: "Nothing has come in through Requests and no quotes have gone out this week.",
      link: `${origin}/requests`,
    });
  }

  // 2. Win rate dropping: the last 60 days against the 12 months before.
  const decided = (from: string, to: string) => {
    const won = all.filter((j) => j.won_at && nzDateKey(j.won_at) >= from && nzDateKey(j.won_at) < to).length;
    const lost = all.filter((j) => j.status === "lost" && j.lost_at && nzDateKey(j.lost_at) >= from && nzDateKey(j.lost_at) < to).length;
    return { won, lost, rate: won + lost ? won / (won + lost) : null, n: won + lost };
  };
  const recent = decided(addDays(today, -60), addDays(today, 1));
  const before = decided(addDays(today, -425), addDays(today, -60));
  if (recent.n >= 5 && before.n >= 5 && recent.rate !== null && before.rate !== null && before.rate - recent.rate >= 0.15) {
    alerts.push({
      key: `win_rate:${today.slice(0, 7)}`,
      title: `Win rate has dropped to ${Math.round(recent.rate * 100)}%`,
      detail: `Last 60 days: ${recent.won} won of ${recent.n} decided. The year before: ${Math.round(before.rate * 100)}%.`,
      link: `${origin}/reports/lead-conversions`,
    });
  }

  // 3. Live jobs that have gone over budget (budget incl. approved variations).
  const live = all.filter((j) => (LIVE_STATUSES as readonly string[]).includes(j.status));
  if (live.length) {
    const ids = live.map((j) => j.id);
    const [{ data: bva }, variations] = await Promise.all([
      db.from("job_budget_vs_actual").select("job_id, budgeted_amount, actual_amount").in("job_id", ids),
      fetchVariations(db, ids),
    ]);
    const byJob = groupBy(bva ?? [], (r) => r.job_id as string);
    const vByJob = groupBy(variations, (v) => v.job_id);
    for (const j of live) {
      const rows = byJob.get(j.id) ?? [];
      const budget = rows.reduce((s, r) => s + Number(r.budgeted_amount), 0) + variationTotals(vByJob.get(j.id) ?? []).approvedBudget;
      const actual = rows.reduce((s, r) => s + Number(r.actual_amount), 0);
      if (budget > 0 && actual > budget) {
        alerts.push({
          key: `over_budget:${j.id}`,
          title: `Over budget: ${label(j)}`,
          detail: `${money(actual)} spent against a ${money(budget)} budget (${Math.round((actual / budget) * 100)}%).`,
          link: `${origin}/jobs/${j.id}`,
        });
      }
    }
  }

  // 4. Finished but not invoiced after a week.
  for (const j of all.filter((j) => j.status === "complete" && j.completed_at && j.completed_at.slice(0, 10) <= weekAgo)) {
    alerts.push({
      key: `not_invoiced:${j.id}`,
      title: `Finished a week ago, not invoiced: ${label(j)}`,
      detail: `Completed ${j.completed_at!.slice(0, 10)}${j.quoted_sell_total ? ` - ${money(j.quoted_sell_total)}` : ""}. Move it to Invoiced once it's gone out.`,
      link: `${origin}/production`,
    });
  }

  // 5. Someone still clocked on after 12+ hours - probably forgot.
  for (const e of openShifts ?? []) {
    const one = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] : v);
    const who = one(e.profiles as { full_name: string } | { full_name: string }[] | null)?.full_name ?? "Someone";
    const site = one(e.sites as { name: string } | { name: string }[] | null)?.name ?? "a site";
    alerts.push({
      key: `open_shift:${e.id}`,
      title: `${who} is still clocked on`,
      detail: `Clocked on at ${site} on ${nzDateKey(e.clock_in_at as string)} at ${nzTimeString(e.clock_in_at as string)} and never clocked off.`,
      link: `${origin}/timesheets/admin/activity`,
    });
  }

  return alerts;
}

export async function sendDailyAlerts(origin: string): Promise<{ sent: number }> {
  const db = createAdminClient();
  const alerts = await findAlerts(origin);
  if (alerts.length === 0) return { sent: 0 };

  const { data: done } = await db.from("hub_alert_log").select("key").in("key", alerts.map((a) => a.key));
  const already = new Set((done ?? []).map((d) => d.key as string));
  const fresh = alerts.filter((a) => !already.has(a.key));
  if (fresh.length === 0) return { sent: 0 };

  const to = (await notificationRecipients("daily_alerts")).join(", ");
  if (!to) return { sent: 0 };

  const result = await sendEmail({
    to,
    fromName: "Platinum Painters Hub",
    subject: fresh.length === 1 ? `Hub alert: ${fresh[0].title}` : `Hub alerts: ${fresh.length} things to look at`,
    text:
      fresh.map((a) => `• ${a.title}\n  ${a.detail}\n  ${a.link}`).join("\n\n") +
      `\n\nEach alert is only sent once. Turn these off under Notifications → Daily alerts.\n`,
  });
  if (!result.sent) {
    console.error("[daily alerts] email failed", result.reason);
    return { sent: 0 };
  }
  await db.from("hub_alert_log").upsert(fresh.map((a) => ({ key: a.key, detail: a.title })), { onConflict: "key", ignoreDuplicates: true });
  return { sent: fresh.length };
}
