// Jobs with the latest clock-in first (latest: job id -> ISO time); the rest
// keep their order. See latestClockInByJob (recentClockIns.ts).
export function byRecentClockIn<T extends { id: string }>(jobs: T[], latest: Map<string, string>): T[] {
  return jobs
    .map((j, i) => ({ j, i, at: latest.get(j.id) ?? "" }))
    .sort((a, b) => (a.at === b.at ? a.i - b.i : a.at < b.at ? 1 : -1))
    .map((x) => x.j);
}
