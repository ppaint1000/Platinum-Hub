"use client";

// Waiting hours grouped by job, one line per painter per week. Tick and
// approve, or approve a whole job; expand a line to see each shift.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { approveHoursAction, unapproveHoursAction } from "@/app/jobs/hours/actions";
import type { HoursGroup, NoRatePerson } from "@/lib/jobs/hoursApproval";
import { NAVY, BLUE, RED, Card, Pill } from "@/components/dashboard/parts";

const TZ = "Pacific/Auckland";
const hrs = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-NZ", { maximumFractionDigits: 2 });
const weekLabel = (monday: string) =>
  new Date(`${monday}T00:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit", timeZone: TZ });

function byJob(groups: HoursGroup[]) {
  const jobs = new Map<string, { jobId: string; jobLabel: string; groups: HoursGroup[] }>();
  for (const g of groups) {
    const j = jobs.get(g.jobId) ?? { jobId: g.jobId, jobLabel: g.jobLabel, groups: [] };
    j.groups.push(g);
    jobs.set(g.jobId, j);
  }
  for (const j of jobs.values()) j.groups.sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.person.localeCompare(b.person));
  return [...jobs.values()].sort((a, b) => a.jobLabel.localeCompare(b.jobLabel));
}

export function HoursApproval({
  waiting,
  approved,
  noRate,
  undoDays,
}: {
  waiting: HoursGroup[];
  approved: HoursGroup[];
  noRate: NoRatePerson[];
  undoDays: number;
}) {
  const router = useRouter();
  const [view, setView] = useState<"waiting" | "approved">("waiting");
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = view === "waiting" ? waiting : approved;
  const jobs = byJob(groups);
  const tickedGroups = groups.filter((g) => ticked.has(g.key));
  const tickedHours = tickedGroups.reduce((s, g) => s + g.hours, 0);

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  async function run(list: HoursGroup[], approve: boolean) {
    setBusy(true);
    setError(null);
    const ids = list.flatMap((g) => g.entries.map((e) => e.entry_id));
    const result = approve ? await approveHoursAction(ids) : await unapproveHoursAction(ids);
    setBusy(false);
    if (result.error) return setError(result.error);
    setTicked(new Set());
    router.refresh();
  }

  const waitingHours = waiting.reduce((s, g) => s + g.hours, 0);

  return (
    <div className="flex flex-col gap-4">
      {noRate.length > 0 && (
        <div className="flex gap-3 rounded-xl p-4 text-sm text-white" style={{ background: RED }}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">No hourly rate on file</p>
            <p className="mt-0.5 text-white/90">
              These people&apos;s hours count on jobs at <strong>$0</strong> until you set their rate on the Users page. A
              first rate covers their past shifts too.
            </p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {noRate.map((p) => (
                <li key={p.user_id}>
                  <span className="font-semibold">{p.person ?? "Unknown"}</span>{" "}
                  <span className="text-white/85">
                    {hrs(p.hours)} hrs · {p.shifts} shift{p.shifts === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
            <Link href="/users" className="mt-2 inline-block font-semibold text-white underline underline-offset-2">
              Set rates on Users →
            </Link>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" role="tablist">
        {(
          [
            ["waiting", `Waiting (${waiting.length})`],
            ["approved", `Approved, last ${undoDays} days (${approved.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            onClick={() => {
              setView(k);
              setTicked(new Set());
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              view === k ? "text-white" : "border border-[#E3E1DA] bg-white text-[#16202E] hover:bg-[#F5F4F0]"
            }`}
            style={view === k ? { background: BLUE } : undefined}
          >
            {label}
          </button>
        ))}
        {view === "waiting" && waiting.length > 0 && (
          <span className="ml-auto text-sm text-[#5B6472]">{hrs(waitingHours)} hrs waiting</span>
        )}
      </div>

      {ticked.size > 0 && (
        <div className="sticky top-20 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-[#9DB6D9] bg-[#E3ECF8] px-3 py-2 text-sm shadow-sm">
          <span className="font-semibold">
            {ticked.size} ticked · {hrs(tickedHours)} hrs
          </span>
          {view === "waiting" ? (
            <button
              type="button"
              onClick={() => run(tickedGroups, true)}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
              style={{ background: BLUE }}
            >
              {busy ? "Approving…" : "Approve ticked"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => run(tickedGroups, false)}
              disabled={busy}
              className="rounded-lg border border-[#E3E1DA] bg-white px-4 py-2 text-sm font-semibold text-[#16202E] hover:bg-[#F5F4F0] disabled:opacity-60"
            >
              {busy ? "Undoing…" : "Undo approval"}
            </button>
          )}
          <button type="button" onClick={() => setTicked(new Set())} className="font-medium hover:underline" style={{ color: BLUE }}>
            Untick all
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm font-semibold" style={{ color: RED }}>
          {error}
        </p>
      )}

      {jobs.length === 0 ? (
        <p className="rounded-xl border border-[#E3E1DA] bg-white p-6 text-center text-sm text-[#5B6472]">
          {view === "waiting" ? "No hours waiting - everything is approved." : `Nothing approved in the last ${undoDays} days.`}
        </p>
      ) : (
        jobs.map((job) => {
          const jobHours = job.groups.reduce((s, g) => s + g.hours, 0);
          const allTicked = job.groups.every((g) => ticked.has(g.key));
          return (
            <Card key={job.jobId} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-white" style={{ background: NAVY }}>
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={allTicked}
                    onChange={() =>
                      setTicked((t) => {
                        const next = new Set(t);
                        for (const g of job.groups) {
                          if (allTicked) next.delete(g.key);
                          else next.add(g.key);
                        }
                        return next;
                      })
                    }
                    aria-label={`Tick all for ${job.jobLabel}`}
                    className="h-4 w-4"
                  />
                  <Link href={`/jobs/${job.jobId}`} className="font-semibold hover:underline">
                    {job.jobLabel}
                  </Link>
                </label>
                <div className="flex items-center gap-3 text-sm">
                  <span>{hrs(jobHours)} hrs</span>
                  {view === "waiting" && (
                    <button
                      type="button"
                      onClick={() => run(job.groups, true)}
                      disabled={busy}
                      className="rounded-lg bg-white px-3 py-1 text-sm font-semibold text-[#16202E] hover:bg-[#E3ECF8] disabled:opacity-60"
                    >
                      Approve all
                    </button>
                  )}
                </div>
              </div>
              <ul className="divide-y divide-[#EFEDE7]">
                {job.groups.map((g) => {
                  const isOpen = open.has(g.key);
                  return (
                    <li key={g.key} className={ticked.has(g.key) ? "bg-[#E3ECF8]" : ""}>
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={ticked.has(g.key)}
                          onChange={() => setTicked((t) => toggle(t, g.key))}
                          aria-label={`Tick ${g.person}, week of ${weekLabel(g.weekStart)}`}
                          className="h-4 w-4"
                        />
                        <button
                          type="button"
                          onClick={() => setOpen((o) => toggle(o, g.key))}
                          aria-expanded={isOpen}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                          <span className="min-w-0">
                            <span className="font-semibold text-[#16202E]">{g.person}</span>
                            <span className="text-[#5B6472]"> · week of {weekLabel(g.weekStart)}</span>
                            <span className="text-[#5B6472]">
                              {" "}
                              · {g.entries.length} shift{g.entries.length === 1 ? "" : "s"}
                            </span>
                            {view === "approved" && g.approvedAt && (
                              <span className="block text-xs text-[#5B6472]">
                                Approved {dayLabel(g.approvedAt)}
                                {g.approvedBy ? ` by ${g.approvedBy}` : ""}
                              </span>
                            )}
                          </span>
                        </button>
                        {g.noRate && (
                          <span title="No hourly rate on file - these hours cost $0 until a rate is set on Users">
                            <Pill level="alert">No rate</Pill>
                          </span>
                        )}
                        <span className="w-16 shrink-0 text-right font-bold">{hrs(g.hours)}</span>
                      </div>
                      {isOpen && (
                        <table className="mb-2 ml-10 mr-3 w-[calc(100%-3.25rem)] text-sm">
                          <tbody>
                            {g.entries.map((e) => (
                              <tr key={e.entry_id} className="text-[#5B6472]">
                                <td className="py-1 pr-3">{dayLabel(e.clock_in_at)}</td>
                                <td className="py-1 pr-3">
                                  {time(e.clock_in_at)} – {time(e.clock_out_at)}
                                </td>
                                <td className="py-1 pr-3">{e.break_minutes ? `${e.break_minutes} min break` : "No break"}</td>
                                <td className="py-1 pr-3">{e.site_name}</td>
                                <td className="py-1 text-right font-medium text-[#16202E]">{hrs(Number(e.hours))} hrs</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}
