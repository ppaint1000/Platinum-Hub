// Job pickers' order (latest: job id -> ISO time of its latest clock-in):
//   1. jobs clocked into today (NZ), latest first
//   2. other In progress jobs
//   3. everything else
// each by latest clock-in, then in the order given. See latestClockInByJob
// (recentClockIns.ts).
const nzDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });

export function byRecentClockIn<T extends { id: string; status?: string | null }>(jobs: T[], latest: Map<string, string>): T[] {
  const today = nzDay(new Date().toISOString());
  const rank = (at: string, status: string | null | undefined) => (at && nzDay(at) === today ? 0 : status === "in_progress" ? 1 : 2);
  return jobs
    .map((j, i) => {
      const at = latest.get(j.id) ?? "";
      return { j, i, at, r: rank(at, j.status) };
    })
    .sort((a, b) => a.r - b.r || (a.at === b.at ? a.i - b.i : a.at < b.at ? 1 : -1))
    .map((x) => x.j);
}
