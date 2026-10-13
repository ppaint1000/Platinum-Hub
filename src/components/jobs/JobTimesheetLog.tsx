// Every timesheet shift on a job (clocked in at one of its sites): who,
// when, lunch, hours, and whether it's approved into Labour and Hours yet.
import Link from "next/link";
import { Panel } from "@/components/ui";

export type TimesheetLogRow = {
  id: string;
  person: string;
  site: string;
  clockIn: string;
  clockOut: string | null;
  breakMinutes: number;
  notes: string | null;
  approved: boolean;
};

const nzDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NZ", { timeZone: "Pacific/Auckland", weekday: "short", day: "numeric", month: "short" });
const nzTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", minute: "2-digit" });
const hoursOf = (r: TimesheetLogRow) =>
  r.clockOut ? Math.max(0, (Date.parse(r.clockOut) - Date.parse(r.clockIn)) / 3600000 - r.breakMinutes / 60) : null;

export function JobTimesheetLog({ rows }: { rows: TimesheetLogRow[] }) {
  const done = rows.filter((r) => r.clockOut);
  const total = done.reduce((s, r) => s + (hoursOf(r) ?? 0), 0);
  const approved = done.filter((r) => r.approved).reduce((s, r) => s + (hoursOf(r) ?? 0), 0);
  const waiting = done.filter((r) => !r.approved).length;
  const people = new Map<string, number>();
  for (const r of done) people.set(r.person, (people.get(r.person) ?? 0) + (hoursOf(r) ?? 0));

  return (
    <Panel className="mt-8 p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Timesheet hours</h2>
        <span className="text-sm text-ink-soft">
          {total.toFixed(1)} h on site · {approved.toFixed(1)} h approved
          {waiting > 0 && (
            <>
              {" · "}
              <Link href="/jobs/hours" className="font-semibold text-[#B91C1C] hover:underline">
                {waiting} shift{waiting === 1 ? "" : "s"} waiting for approval
              </Link>
            </>
          )}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No one has clocked in to this job&apos;s site yet.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-ink-soft">
            By person: {[...people].map(([p, h]) => `${p} ${h.toFixed(1)} h`).join(" · ")}. Approved hours count in Labour and Hours above (at each person&apos;s
            hourly cost). Actual clock times - payroll rounding isn&apos;t applied here.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="py-2 pr-2 font-semibold">Date</th>
                  <th className="px-2 py-2 font-semibold">Who</th>
                  <th className="px-2 py-2 font-semibold">Clocked</th>
                  <th className="px-2 py-2 text-right font-semibold">Lunch</th>
                  <th className="px-2 py-2 text-right font-semibold">Hours</th>
                  <th className="py-2 pl-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((r) => {
                  const h = hoursOf(r);
                  return (
                    <tr key={r.id} className="border-b border-line/60 align-top">
                      <td className="py-2 pr-2 whitespace-nowrap">{nzDay(r.clockIn)}</td>
                      <td className="px-2 py-2">
                        {r.person}
                        {r.notes && <span className="block text-xs text-ink-soft">{r.notes}</span>}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {nzTime(r.clockIn)} – {r.clockOut ? nzTime(r.clockOut) : "still on"}
                      </td>
                      <td className="px-2 py-2 text-right">{r.breakMinutes ? `${r.breakMinutes} min` : "—"}</td>
                      <td className="px-2 py-2 text-right font-semibold">{h == null ? "—" : h.toFixed(2)}</td>
                      <td className="py-2 pl-2">
                        {!r.clockOut ? (
                          <span className="text-xs text-amber-700">Clocked on</span>
                        ) : r.approved ? (
                          <span className="text-xs text-green-700">Approved</span>
                        ) : (
                          <Link href="/jobs/hours" className="text-xs font-semibold text-[#B91C1C] hover:underline">
                            Waiting →
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}
