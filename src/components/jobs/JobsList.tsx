"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Panel, StatusRow, StatusLabel, Money } from "@/components/ui";
import { jobStatusLabel } from "@/design/tailwind.tokens";

type JobStatus = "draft" | "quoted" | "won" | "in_progress" | "complete" | "lost";

export type JobListRow = {
  id: string;
  jobNumber: string | null;
  name: string;
  status: JobStatus;
  clientName: string | null;
  leadName: string | null;
  quotedSellTotal: number | null;
  quotedHours: number | null;
  hoursActual: number;
  margin: number | null;
  // True when there are no recorded costs yet and the margin is worked out
  // from the quote's budget instead.
  marginIsEstimate: boolean;
  completedAt: string | null;
  lostAt: string | null;
  lostTo: string | null;
};

// Fixed order the user actually asked for; "draft" only shows up as a tab
// when there's at least one (it's a rare transient state, not part of the
// normal pipeline).
const STAGE_TABS: JobStatus[] = ["quoted", "won", "in_progress", "complete", "lost"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NZ", { day: "2-digit", month: "short", year: "numeric" });
}

function matches(job: JobListRow, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    job.name.toLowerCase().includes(q) ||
    (job.jobNumber?.toLowerCase().includes(q) ?? false) ||
    (job.clientName?.toLowerCase().includes(q) ?? false)
  );
}

type Tab = JobStatus | "salesperson";

function JobRowItem({ job }: { job: JobListRow }) {
  return (
    <Link href={`/jobs/${job.id}`}>
      <StatusRow status={job.status}>
        <div className="flex items-center gap-4">
          <span className="w-24 font-mono text-sm text-ink-faint">{job.jobNumber ?? "—"}</span>
          <div>
            <div className="font-medium text-ink">{job.name}</div>
            <div className="text-sm text-ink-soft">
              {job.clientName ?? "No client set"}
              {job.status === "complete" && job.completedAt && ` — completed ${fmtDate(job.completedAt)}`}
              {job.status === "lost" &&
                ` — lost to ${job.lostTo ?? "unknown"}${job.lostAt ? ` on ${fmtDate(job.lostAt)}` : ""}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          {job.quotedHours != null && (
            <span className="text-ink-soft tabular-nums">
              {job.hoursActual.toFixed(0)} / {job.quotedHours.toFixed(0)} hrs
            </span>
          )}
          {job.margin != null && (
            <span
              className="tabular-nums text-ink-soft"
              title={job.marginIsEstimate ? "Expected GP from the quote's budget - no costs recorded yet" : undefined}
            >
              {(job.margin * 100).toFixed(0)}%{job.marginIsEstimate ? " est." : ""} GP
            </span>
          )}
          {job.quotedSellTotal != null && <Money value={job.quotedSellTotal} />}
          <StatusLabel status={job.status} />
        </div>
      </StatusRow>
    </Link>
  );
}

export function JobsList({ jobs }: { jobs: JobListRow[] }) {
  const [query, setQuery] = useState("");
  const hasDraft = jobs.some((j) => j.status === "draft");
  const tabs: Tab[] = [...STAGE_TABS.slice(0, 1), ...(hasDraft ? (["draft"] as Tab[]) : []), ...STAGE_TABS.slice(1), "salesperson"];
  const [tab, setTab] = useState<Tab>("quoted");

  const filtered = useMemo(() => jobs.filter((j) => matches(j, query)), [jobs, query]);

  const countByStatus = useMemo(() => {
    const counts = new Map<JobStatus, number>();
    for (const j of filtered) counts.set(j.status, (counts.get(j.status) ?? 0) + 1);
    return counts;
  }, [filtered]);

  const salespersonGroups = useMemo(() => {
    const names = Array.from(new Set(filtered.map((j) => j.leadName ?? "Unassigned"))).sort(
      (a, b) => (a === "Unassigned" ? 1 : b === "Unassigned" ? -1 : a.localeCompare(b))
    );
    return names.map((name) => ({
      key: name,
      label: name,
      jobs: filtered.filter((j) => (j.leadName ?? "Unassigned") === name),
    }));
  }, [filtered]);

  const groups: { key: string; label: string; jobs: JobListRow[] }[] =
    tab === "salesperson"
      ? salespersonGroups
      : [
          {
            key: tab,
            label: jobStatusLabel[tab] ?? tab,
            jobs: filtered.filter((j) => j.status === tab),
          },
        ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t
                ? "border-accent text-ink"
                : "border-transparent text-ink-soft hover:text-ink"
            }`}
          >
            {t === "salesperson" ? "By salesperson" : jobStatusLabel[t] ?? t}
            {t !== "salesperson" && ` · ${countByStatus.get(t) ?? 0}`}
          </button>
        ))}
      </div>

      <div className="mb-6 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by job number, name, or client…"
          className="w-full rounded-md border border-line bg-paper-raised py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      {jobs.length > 0 && filtered.length === 0 && (
        <Panel className="p-6 text-center text-ink-soft">
          No jobs match &ldquo;{query}&rdquo;.
        </Panel>
      )}

      <div className="space-y-8">
        {groups.map((group) =>
          group.jobs.length === 0 ? (
            tab === "salesperson" ? null : (
              <p key={group.key} className="text-sm text-ink-soft">
                No jobs in this stage{query ? " match your search" : ""}.
              </p>
            )
          ) : (
            <div key={group.key}>
              {tab === "salesperson" && (
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
                  {group.label} · {group.jobs.length}
                </h2>
              )}
              <div className="space-y-2">
                {group.jobs.map((job) => (
                  <JobRowItem key={job.id} job={job} />
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
