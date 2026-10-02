// Timesheet hours only count on a job once an admin approves them (see
// supabase/job_hours_approvals.sql). Shifts are approved a person-week at a
// time: one painter, one job, one Monday-Sunday week.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { mondayOf, nzDateKey } from "@/lib/timesheets/formatNZ";

export type HoursEntry = {
  entry_id: string;
  user_id: string;
  person: string | null;
  job_id: string;
  job_number: string | null;
  job_name: string;
  site_name: string;
  clock_in_at: string;
  clock_out_at: string;
  break_minutes: number | null;
  hours: number;
  approved_at: string | null;
  approved_by_name: string | null;
  has_rate: boolean;
};

export type HoursGroup = {
  key: string;
  jobId: string;
  jobLabel: string;
  userId: string;
  person: string;
  weekStart: string; // YYYY-MM-DD, a Monday (NZ)
  hours: number;
  entries: HoursEntry[];
  noRate: boolean; // some shift has no hourly rate on file for its day
  approvedAt: string | null; // latest approval in the group (approved groups)
  approvedBy: string | null;
};

export type NoRatePerson = { user_id: string; person: string | null; hours: number; shifts: number };

export function groupEntries(entries: HoursEntry[]): HoursGroup[] {
  const groups = new Map<string, HoursGroup>();
  for (const e of entries) {
    const weekStart = mondayOf(nzDateKey(e.clock_in_at));
    const key = `${e.job_id}|${e.user_id}|${weekStart}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        jobId: e.job_id,
        jobLabel: e.job_number ? `${e.job_number} · ${e.job_name}` : e.job_name,
        userId: e.user_id,
        person: e.person ?? "Unknown",
        weekStart,
        hours: 0,
        entries: [],
        noRate: false,
        approvedAt: null,
        approvedBy: null,
      };
      groups.set(key, g);
    }
    g.entries.push(e);
    g.hours += Number(e.hours);
    if (!e.has_rate) g.noRate = true;
    if (e.approved_at && (!g.approvedAt || e.approved_at > g.approvedAt)) {
      g.approvedAt = e.approved_at;
      g.approvedBy = e.approved_by_name;
    }
  }
  return [...groups.values()];
}

// Waiting shifts, plus those approved in the last `approvedDays` days (for
// undo; 0 = waiting only).
export async function loadHoursEntries(supabase: SupabaseClient, approvedDays: number) {
  const since = new Date(Date.now() - approvedDays * 86_400_000);
  const { data, error } = await supabase.rpc("job_hours_entries", { p_since: since.toISOString() });
  if (error) throw new Error(error.message);
  return (data ?? []) as HoursEntry[];
}

export async function loadNoRate(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("job_hours_no_rate");
  if (error) throw new Error(error.message);
  return ((data ?? []) as NoRatePerson[]).map((p) => ({ ...p, hours: Number(p.hours), shifts: Number(p.shifts) }));
}

// Red counts on the admin bar: person-weeks waiting (Jobs) and people with
// job hours but no rate (Users). Never breaks a page if it fails.
export async function hoursAlertCounts(): Promise<{ waiting: number; noRate: number }> {
  try {
    const supabase = await createClient();
    const [entries, noRate] = await Promise.all([loadHoursEntries(supabase, 0), loadNoRate(supabase)]);
    return {
      waiting: groupEntries(entries.filter((e) => !e.approved_at)).length,
      noRate: noRate.length,
    };
  } catch {
    return { waiting: 0, noRate: 0 };
  }
}
