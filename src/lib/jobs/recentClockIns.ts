import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Each job's latest clock-in (from its sites' timesheets over the last 90
// days) - so job pickers can put the jobs crews are on right now at the
// top. Read with the service role: timesheets aren't visible to everyone.
export async function latestClockInByJob(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const [{ data: sites }, { data: entries }] = await Promise.all([
    admin.from("sites").select("id, job_id").not("job_id", "is", null),
    admin.from("timesheet_entries").select("site_id, clock_in_at").gte("clock_in_at", since).not("site_id", "is", null),
  ]);
  const jobBySite = new Map((sites ?? []).map((s) => [s.id as string, s.job_id as string]));
  const latest = new Map<string, string>();
  for (const e of entries ?? []) {
    const job = jobBySite.get(e.site_id as string);
    if (job && (latest.get(job) ?? "") < (e.clock_in_at as string)) latest.set(job, e.clock_in_at as string);
  }
  return latest;
}

// Each person's most recent clocked-in job (last 90 days): user id -> job
// id. Used by the waterblaster fuel pickers to put the driver's own current
// job at the top.
export async function latestJobByUser(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const [{ data: sites }, { data: entries }] = await Promise.all([
    admin.from("sites").select("id, job_id").not("job_id", "is", null),
    admin
      .from("timesheet_entries")
      .select("user_id, site_id, clock_in_at")
      .gte("clock_in_at", since)
      .not("site_id", "is", null)
      .order("clock_in_at", { ascending: false }),
  ]);
  const jobBySite = new Map((sites ?? []).map((s) => [s.id as string, s.job_id as string]));
  const latest = new Map<string, string>();
  // Newest first, so the first job seen for each person is their latest.
  for (const e of entries ?? []) {
    const job = jobBySite.get(e.site_id as string);
    if (job && !latest.has(e.user_id as string)) latest.set(e.user_id as string, job);
  }
  return latest;
}

export { byRecentClockIn, withJobFirst } from "./jobOrder";
