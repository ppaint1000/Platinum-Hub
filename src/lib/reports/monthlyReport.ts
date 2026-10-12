// The monthly business report - one month on a page, against the month
// before: enquiries, quotes, wins, money claimed, jobs finished, hours,
// absences and marketing. Shown at Reports → Monthly report and emailed
// to admins on the 1st (Notifications: "Monthly business report").
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { notificationRecipients } from "@/lib/notifications/recipients";
import { isWonStatus } from "@/lib/jobs/status";
import { COUNTED_TYPES, ABSENCE_LABEL, type AbsenceType } from "@/lib/absences/types";
import { nzDateKey, nzDayStartUtcIso } from "@/lib/timesheets/formatNZ";
import { LIVE_STATUSES } from "@/lib/jobs/jobFinance";

export type MonthFigures = {
  enquiries: number;
  quotesSent: number;
  quotedValue: number;
  won: number;
  wonValue: number;
  lost: number;
  winRate: number | null;
  claimed: number;
  completed: number;
  hours: number;
  absences: Record<string, number>;
  spend: number;
  topSources: { source: string; value: number }[];
};

export type MonthlyReport = {
  month: string; // YYYY-MM
  label: string;
  previousLabel: string;
  current: MonthFigures;
  previous: MonthFigures;
  live: { jobs: number; contract: number; claimed: number };
};

export const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-NZ", { month: "long", year: "numeric", timeZone: "UTC" });
export const shiftMonth = (m: string, n: number) =>
  new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

type JobRow = {
  id: string;
  status: string;
  lead_source: string | null;
  quoted_sell_total: number | null;
  quoted_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  completed_at: string | null;
};

export async function buildMonthlyReport(month: string): Promise<MonthlyReport> {
  const db = createAdminClient();
  const prev = shiftMonth(month, -1);
  const from = `${prev}-01`;
  const to = `${shiftMonth(month, 1)}-01`;

  const [{ data: jobs }, { data: requests }, { data: claims }, { data: entries }, { data: absences }, { data: spend }] = await Promise.all([
    db.from("jobs").select("id, status, lead_source, quoted_sell_total, quoted_at, won_at, lost_at, completed_at").returns<JobRow[]>(),
    db.from("requests").select("created_at").gte("created_at", nzDayStartUtcIso(from)).lt("created_at", nzDayStartUtcIso(to)),
    db.from("job_claims").select("job_id, claim_date, amount"),
    db
      .from("timesheet_entries")
      .select("clock_in_at, clock_out_at, break_minutes")
      .gte("clock_in_at", nzDayStartUtcIso(from))
      .lt("clock_in_at", nzDayStartUtcIso(to))
      .not("clock_out_at", "is", null),
    db.from("absences").select("absence_date, absence_type").gte("absence_date", from).lt("absence_date", to).is("dismissed_at", null),
    db.from("marketing_spend").select("month, amount").gte("month", from).lt("month", to),
  ]);
  const all = jobs ?? [];
  const inMonth = (d: string | null | undefined, m: string) => !!d && (d.length === 10 ? d : nzDateKey(d)).slice(0, 7) === m;

  const figures = (m: string): MonthFigures => {
    const quoted = all.filter((j) => j.status !== "draft" && inMonth(j.quoted_at, m));
    const won = all.filter((j) => isWonStatus(j.status) && inMonth(j.won_at, m));
    const lost = all.filter((j) => j.status === "lost" && inMonth(j.lost_at, m));
    const bySource = new Map<string, number>();
    for (const j of won) bySource.set(j.lead_source ?? "Not recorded", (bySource.get(j.lead_source ?? "Not recorded") ?? 0) + Number(j.quoted_sell_total ?? 0));
    const abs: Record<string, number> = {};
    for (const a of (absences ?? []).filter((a) => (a.absence_date as string).slice(0, 7) === m)) {
      if (a.absence_type && COUNTED_TYPES.includes(a.absence_type as AbsenceType)) {
        const l = ABSENCE_LABEL[a.absence_type as AbsenceType];
        abs[l] = (abs[l] ?? 0) + 1;
      }
    }
    return {
      enquiries: (requests ?? []).filter((r) => inMonth(r.created_at as string, m)).length,
      quotesSent: quoted.length,
      quotedValue: quoted.reduce((s, j) => s + Number(j.quoted_sell_total ?? 0), 0),
      won: won.length,
      wonValue: won.reduce((s, j) => s + Number(j.quoted_sell_total ?? 0), 0),
      lost: lost.length,
      winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
      claimed: (claims ?? []).filter((c) => inMonth(c.claim_date as string, m)).reduce((s, c) => s + Number(c.amount), 0),
      completed: all.filter((j) => inMonth(j.completed_at, m)).length,
      hours: (entries ?? [])
        .filter((e) => inMonth(e.clock_in_at as string, m))
        .reduce(
          (s, e) =>
            s + Math.max(0, (Date.parse(e.clock_out_at as string) - Date.parse(e.clock_in_at as string)) / 3600000 - Number(e.break_minutes ?? 0) / 60),
          0
        ),
      absences: abs,
      spend: (spend ?? []).filter((r) => (r.month as string).slice(0, 7) === m).reduce((s, r) => s + Number(r.amount), 0),
      topSources: [...bySource].map(([source, value]) => ({ source, value })).sort((a, b) => b.value - a.value).slice(0, 5),
    };
  };

  const live = all.filter((j) => (LIVE_STATUSES as readonly string[]).includes(j.status));
  const liveIds = new Set(live.map((j) => j.id));
  return {
    month,
    label: monthLabel(month),
    previousLabel: monthLabel(prev),
    current: figures(month),
    previous: figures(prev),
    live: {
      jobs: live.length,
      contract: live.reduce((s, j) => s + Number(j.quoted_sell_total ?? 0), 0),
      claimed: (claims ?? []).filter((c) => liveIds.has(c.job_id as string)).reduce((s, c) => s + Number(c.amount), 0),
    },
  };
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-NZ");
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

// The rows shown on the page and in the email: label, this month, last month.
export function reportLines(r: MonthlyReport): { label: string; now: string; before: string; up?: boolean | null }[] {
  const c = r.current;
  const p = r.previous;
  const cmp = (a: number, b: number) => (a === b ? null : a > b);
  const absTotal = (f: MonthFigures) => Object.values(f.absences).reduce((s, n) => s + n, 0);
  return [
    { label: "Enquiries in", now: String(c.enquiries), before: String(p.enquiries), up: cmp(c.enquiries, p.enquiries) },
    { label: "Quotes sent", now: `${c.quotesSent} · ${money(c.quotedValue)}`, before: `${p.quotesSent} · ${money(p.quotedValue)}`, up: cmp(c.quotedValue, p.quotedValue) },
    { label: "Jobs won", now: `${c.won} · ${money(c.wonValue)}`, before: `${p.won} · ${money(p.wonValue)}`, up: cmp(c.wonValue, p.wonValue) },
    { label: "Lost", now: String(c.lost), before: String(p.lost) },
    { label: "Win rate", now: pct(c.winRate), before: pct(p.winRate), up: c.winRate != null && p.winRate != null ? cmp(c.winRate, p.winRate) : null },
    { label: "Claimed (invoiced to customers)", now: money(c.claimed), before: money(p.claimed), up: cmp(c.claimed, p.claimed) },
    { label: "Jobs finished", now: String(c.completed), before: String(p.completed), up: cmp(c.completed, p.completed) },
    { label: "Hours worked", now: `${Math.round(c.hours)} h`, before: `${Math.round(p.hours)} h` },
    { label: "Absence days", now: String(absTotal(c)), before: String(absTotal(p)), up: absTotal(c) === absTotal(p) ? null : absTotal(c) < absTotal(p) },
    { label: "Marketing spend", now: money(c.spend), before: money(p.spend) },
  ];
}

export async function emailMonthlyReport(month: string, origin: string): Promise<boolean> {
  const to = (await notificationRecipients("monthly_report")).join(", ");
  if (!to) return false;
  const r = await buildMonthlyReport(month);
  const lines = reportLines(r);
  const absences = Object.entries(r.current.absences).map(([k, n]) => `${k} ${n}`).join(", ") || "none";
  const sources = r.current.topSources.map((s) => `${s.source} ${money(s.value)}`).join(", ") || "no wins";
  const text =
    `${r.label} at Platinum Painters (against ${r.previousLabel}):\n\n` +
    lines.map((l) => `${l.label}: ${l.now}   (${l.before})`).join("\n") +
    `\n\nWon by lead source: ${sources}\nAbsences: ${absences}\n` +
    `\nRight now: ${r.live.jobs} live jobs worth ${money(r.live.contract)}, ${money(r.live.claimed)} claimed so far.\n` +
    `\nThe full report: ${origin}/reports/monthly?month=${month}\n`;
  const html =
    `<div style="font-family:Arial,sans-serif;color:#16202E;max-width:640px">` +
    `<h2 style="margin:0 0 4px">${r.label}</h2><p style="margin:0 0 16px;color:#5B6472">Against ${r.previousLabel}</p>` +
    `<table style="border-collapse:collapse;width:100%;font-size:14px">` +
    `<tr><th style="text-align:left;padding:6px;border-bottom:2px solid #E3E1DA"></th><th style="text-align:right;padding:6px;border-bottom:2px solid #E3E1DA">${r.label}</th><th style="text-align:right;padding:6px;border-bottom:2px solid #E3E1DA;color:#5B6472">${r.previousLabel}</th></tr>` +
    lines
      .map(
        (l) =>
          `<tr><td style="padding:6px;border-bottom:1px solid #EEEDE8">${l.label}</td>` +
          `<td style="padding:6px;border-bottom:1px solid #EEEDE8;text-align:right;font-weight:bold;color:${l.up === true ? "#15803D" : l.up === false ? "#B91C1C" : "#16202E"}">${l.now}</td>` +
          `<td style="padding:6px;border-bottom:1px solid #EEEDE8;text-align:right;color:#5B6472">${l.before}</td></tr>`
      )
      .join("") +
    `</table>` +
    `<p style="font-size:14px"><b>Won by lead source:</b> ${sources}<br><b>Absences:</b> ${absences}</p>` +
    `<p style="font-size:14px"><b>Right now:</b> ${r.live.jobs} live jobs worth ${money(r.live.contract)}, ${money(r.live.claimed)} claimed so far.</p>` +
    `<p><a href="${origin}/reports/monthly?month=${month}" style="color:#1F4E8C;font-weight:bold">Open the full report in the Hub →</a></p></div>`;
  const result = await sendEmail({ to, fromName: "Platinum Painters Hub", subject: `Monthly report: ${r.label}`, text, html });
  if (!result.sent) console.error("[monthly report] email failed", result.reason);
  return result.sent;
}
