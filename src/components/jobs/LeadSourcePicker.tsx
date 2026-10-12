"use client";

// Go down the jobs and pick where each one came from - saved as soon as
// it's picked. After picking, the same source can be put on the client's
// other jobs that don't have one yet, in one click.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { setLeadSourceAction } from "@/app/jobs/actions";
import { LEAD_SOURCES } from "@/lib/jobs/leadSources";

export type LeadSourceJob = {
  id: string;
  label: string;
  clientId: string | null;
  clientName: string | null;
  status: string;
  date: string | null;
  value: number;
  leadSource: string | null;
};

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-NZ");
const nzDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "2-digit" }) : "—");

export function LeadSourcePicker({ jobs, statusLabel }: { jobs: LeadSourceJob[]; statusLabel: Record<string, string> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [q, setQ] = useState("");
  // What's been picked here (shown straight away, before the page refreshes).
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [offer, setOffer] = useState<{ jobId: string; source: string; clientName: string; ids: string[] } | null>(null);
  const [error, setError] = useState("");

  const sourceOf = (j: LeadSourceJob) => picked[j.id] ?? j.leadSource ?? "";
  const missing = jobs.filter((j) => !sourceOf(j)).length;

  // Keep a job on screen once it's been picked here, even with "only missing".
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return jobs.filter(
      (j) =>
        (!onlyMissing || !j.leadSource || j.id in picked) &&
        (!term || `${j.label} ${j.clientName ?? ""}`.toLowerCase().includes(term))
    );
  }, [jobs, onlyMissing, q, picked]);

  function save(ids: string[], source: string, after?: () => void) {
    setError("");
    setPicked((p) => ({ ...p, ...Object.fromEntries(ids.map((id) => [id, source])) }));
    startTransition(async () => {
      const r = await setLeadSourceAction(ids, source);
      if (r.error) return setError(r.error);
      after?.();
      router.refresh();
    });
  }

  function pick(job: LeadSourceJob, source: string) {
    save([job.id], source, () => {
      const others = job.clientId
        ? jobs.filter((o) => o.id !== job.id && o.clientId === job.clientId && !sourceOf(o)).map((o) => o.id)
        : [];
      setOffer(source && others.length ? { jobId: job.id, source, clientName: job.clientName ?? "this client", ids: others } : null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search job or client"
          className="min-h-10 w-full max-w-xs rounded-lg border border-line bg-white px-3 text-sm"
        />
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="h-4 w-4" />
          Only jobs without a lead source
        </label>
        <span className="ml-auto text-sm text-ink-soft">
          {missing === 0 ? "Every job has a lead source." : `${missing} of ${jobs.length} still to do`}
          {pending && " · saving…"}
        </span>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {offer && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#9DB6D9] bg-[#EEF3FA] px-4 py-3 text-sm">
          <span>
            Set <b>{offer.source}</b> on {offer.clientName}&apos;s other {offer.ids.length} job{offer.ids.length === 1 ? "" : "s"} without one too?
          </span>
          <button
            onClick={() => save(offer.ids, offer.source, () => setOffer(null))}
            className="rounded-md bg-ink px-3 py-1.5 font-semibold text-white"
          >
            Yes, set all {offer.ids.length}
          </button>
          <button onClick={() => setOffer(null)} className="rounded-md px-3 py-1.5 font-medium text-ink-soft hover:bg-black/5">
            No
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-line bg-paper-raised">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-3 py-2 font-semibold">Job</th>
              <th className="px-3 py-2 font-semibold">Client</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">Quoted</th>
              <th className="px-3 py-2 text-right font-semibold">Value</th>
              <th className="px-3 py-2 font-semibold">Lead source</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((j) => {
              const current = sourceOf(j);
              return (
                <tr key={j.id} className="border-b border-line/60 last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/jobs/${j.id}`} className="font-medium text-ink hover:text-accent">
                      {j.label}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{j.clientName ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-soft">{statusLabel[j.status] ?? j.status}</td>
                  <td className="px-3 py-2 text-ink-soft">{nzDate(j.date)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(j.value)}</td>
                  <td className="px-3 py-2">
                    <select
                      value={current}
                      onChange={(e) => pick(j, e.target.value)}
                      aria-label={`Lead source for ${j.label}`}
                      className={`w-full min-w-48 rounded border px-2 py-1.5 text-sm ${current ? "border-line bg-white" : "border-amber-300 bg-amber-50"}`}
                    >
                      <option value="">— Choose —</option>
                      {[...LEAD_SOURCES, ...(current && !(LEAD_SOURCES as readonly string[]).includes(current) ? [current] : [])].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ink-soft">
                  {onlyMissing ? "Nothing left to do - every job has a lead source." : "No jobs match."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
