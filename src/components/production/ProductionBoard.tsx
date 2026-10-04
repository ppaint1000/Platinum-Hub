"use client";

// The Production board: a column per stage. Drag a card to another column,
// or use its "Move to" menu (phones, keyboards). Supervisors can't move
// jobs to or from Invoiced / Paid - those columns are admin-only.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckSquare, Search, X } from "lucide-react";
import { setProductionStatusAction, toggleChecklistItemAction } from "@/app/production/actions";
import {
  CHECKLIST_BEFORE,
  CHECKLIST_NAMES,
  type ChecklistItem,
  type ChecklistKind,
  type ChecklistTick,
} from "@/lib/jobs/checklists";
import { PRODUCTION_STAGES, SUPERVISOR_STAGES, type JobStatus } from "@/lib/jobs/status";
import type { ProductionJob } from "@/lib/jobs/production";
import { BLUE, NAVY, RED, money } from "@/components/dashboard/parts";

const TZ = "Pacific/Auckland";
const shortDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00+12:00` : iso).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    timeZone: TZ,
  });

// When the job reached the stage it's in.
function stageDate(j: ProductionJob): string | null {
  switch (j.status) {
    case "won":
      return j.won_at ? `Won ${shortDate(j.won_at)}` : null;
    case "scheduled":
      return j.scheduled_at ? `Scheduled ${shortDate(j.scheduled_at)}` : null;
    case "complete":
      return j.completed_at ? `Completed ${shortDate(j.completed_at)}` : null;
    case "invoiced":
      return j.invoiced_at ? `Invoiced ${shortDate(j.invoiced_at)}` : null;
    case "paid":
      return j.paid_at ? `Paid ${shortDate(j.paid_at)}` : null;
    default:
      return `Updated ${shortDate(j.updated_at)}`;
  }
}

export function ProductionBoard({
  jobs: initialJobs,
  isAdmin,
  paidShownDays,
  checklistItems,
  checklistTicks,
}: {
  jobs: ProductionJob[];
  isAdmin: boolean;
  paidShownDays: number;
  checklistItems: ChecklistItem[];
  checklistTicks: ChecklistTick[];
}) {
  const router = useRouter();
  // Moves show straight away; the server confirms (or puts it back).
  const [jobs, setJobs] = useState(initialJobs);
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Checklists ──
  const [ticks, setTicks] = useState(checklistTicks);
  const [openChecklist, setOpenChecklist] = useState<string | null>(null);
  const itemsOf = (kind: ChecklistKind) => checklistItems.filter((i) => i.checklist === kind);
  const tickFor = (jobId: string, itemId: string) => ticks.find((t) => t.job_id === jobId && t.item_id === itemId);
  const progress = (jobId: string, kind: ChecklistKind) => {
    const items = itemsOf(kind);
    return { done: items.filter((i) => tickFor(jobId, i.id)).length, total: items.length };
  };
  async function toggleTick(jobId: string, itemId: string, done: boolean) {
    const before = ticks;
    setTicks((ts) =>
      done
        ? [...ts, { job_id: jobId, item_id: itemId, done_at: new Date().toISOString(), done_by_name: "You" }]
        : ts.filter((t) => !(t.job_id === jobId && t.item_id === itemId))
    );
    const result = await toggleChecklistItemAction(jobId, itemId, done);
    if (result.error) {
      setTicks(before);
      setError(result.error);
    }
  }

  const canMoveTo = (to: JobStatus, from: JobStatus) =>
    isAdmin || (SUPERVISOR_STAGES.includes(to) && SUPERVISOR_STAGES.includes(from));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((j) =>
      [j.name, j.job_number, j.client_name].some((v) => v?.toLowerCase().includes(q))
    );
  }, [jobs, query]);

  async function move(job: ProductionJob, to: JobStatus) {
    if (job.status === to) return;
    if (!canMoveTo(to, job.status)) {
      setError("Only an admin can move a job to or from Invoiced or Paid.");
      return;
    }
    // Starting or finishing a job with its checklist not done asks first.
    const kind = CHECKLIST_BEFORE[to];
    if (kind) {
      const p = progress(job.id, kind);
      if (p.total > 0 && p.done < p.total) {
        const ok = window.confirm(
          `The ${CHECKLIST_NAMES[kind].toLowerCase()} for ${job.name} isn't finished (${p.done} of ${p.total} done). Move it anyway?`
        );
        if (!ok) return;
      }
    }
    setError(null);
    const before = jobs;
    const now = new Date().toISOString();
    setJobs((list) =>
      list.map((j) =>
        j.id === job.id
          ? {
              ...j,
              status: to,
              updated_at: now,
              scheduled_at: to === "scheduled" && !j.scheduled_at ? now : j.scheduled_at,
              completed_at: to === "complete" && !j.completed_at ? now.slice(0, 10) : j.completed_at,
              invoiced_at: to === "invoiced" && !j.invoiced_at ? now : j.invoiced_at,
              paid_at: to === "paid" && !j.paid_at ? now : j.paid_at,
            }
          : j
      )
    );
    const result = await setProductionStatusAction(job.id, to);
    if (result.error) {
      setJobs(before);
      setError(result.error);
      return;
    }
    router.refresh();
  }

  const readyToInvoice = jobs.filter((j) => j.status === "complete");

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && readyToInvoice.length > 0 && (
        <div className="flex gap-3 rounded-xl p-4 text-sm text-white" style={{ background: RED }} role="alert">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">
              {readyToInvoice.length} job{readyToInvoice.length === 1 ? "" : "s"} completed - ready to invoice
            </p>
            <p className="mt-0.5 text-white/90">
              {readyToInvoice
                .map((j) => (j.job_number ? `${j.job_number} ${j.name}` : j.name))
                .join(" · ")}
            </p>
            <p className="mt-1 text-white/90">Move each one to Invoiced once the invoice has gone out.</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A919C]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by job, number or client…"
            className="w-full rounded-lg border border-[#E3E1DA] bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#9DB6D9]"
          />
        </div>
        <p className="text-xs text-[#5B6472]">
          Drag a card to move it, or use Move to. Paid jobs show for {paidShownDays} days.
          {!isAdmin && " Only an admin can move jobs to Invoiced or Paid."}
        </p>
        {isAdmin && (
          <Link href="/production/checklists" className="text-sm font-semibold hover:underline" style={{ color: BLUE }}>
            Edit checklists
          </Link>
        )}
      </div>

      {error && (
        <p className="text-sm font-semibold" style={{ color: RED }} role="alert">
          {error}
        </p>
      )}

      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        <div className="grid min-w-[1260px] grid-cols-6 gap-3">
          {PRODUCTION_STAGES.map((stage) => {
            const cards = visible.filter((j) => j.status === stage.status);
            const total = cards.reduce((s, j) => s + Number(j.value ?? 0), 0);
            const dragged = dragId ? jobs.find((j) => j.id === dragId) : null;
            const droppable = !!dragged && dragged.status !== stage.status && canMoveTo(stage.status, dragged.status);
            const locked = !isAdmin && !SUPERVISOR_STAGES.includes(stage.status);
            return (
              <section
                key={stage.status}
                aria-label={stage.label}
                onDragOver={(e) => {
                  if (!droppable) return;
                  e.preventDefault();
                  setOverStage(stage.status);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage.status ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverStage(null);
                  if (dragged && droppable) move(dragged, stage.status);
                  setDragId(null);
                }}
                className={`flex min-h-[24rem] flex-col rounded-xl border bg-[#ECEAE3]/60 transition ${
                  overStage === stage.status ? "border-[#1F4E8C] bg-[#E3ECF8]" : "border-[#E3E1DA]"
                }`}
              >
                <header
                  className="rounded-t-xl px-3 py-2.5 text-white"
                  style={{ background: stage.status === "complete" && isAdmin && cards.length > 0 ? RED : NAVY }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">{stage.label}</h2>
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold">{cards.length}</span>
                  </div>
                  {isAdmin && <p className="mt-0.5 text-xs text-white/80">{money(total)}</p>}
                  {locked && <p className="mt-0.5 text-xs text-white/80">Admin only</p>}
                </header>
                <ul className="flex flex-1 flex-col gap-2 p-2">
                  {cards.map((j) => {
                    const movable = isAdmin || SUPERVISOR_STAGES.includes(j.status);
                    return (
                      <li
                        key={j.id}
                        draggable={movable}
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", j.id);
                          setDragId(j.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverStage(null);
                        }}
                        className={`rounded-lg border border-[#E3E1DA] bg-white p-2.5 text-sm shadow-sm ${
                          movable ? "cursor-grab active:cursor-grabbing" : ""
                        } ${dragId === j.id ? "opacity-50" : ""}`}
                      >
                        {j.job_number && <p className="text-xs font-semibold text-[#5B6472]">{j.job_number}</p>}
                        {isAdmin ? (
                          <Link href={`/jobs/${j.id}`} className="font-semibold hover:underline" style={{ color: BLUE }}>
                            {j.name}
                          </Link>
                        ) : (
                          <p className="font-semibold text-[#16202E]">{j.name}</p>
                        )}
                        {j.client_name && <p className="text-xs text-[#5B6472]">{j.client_name}</p>}
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-[#5B6472]">
                          <span>{stageDate(j)}</span>
                          {isAdmin && j.value != null && (
                            <span className="font-semibold text-[#16202E]">{money(Number(j.value))}</span>
                          )}
                        </div>
                        {(j.status === "won" || j.status === "scheduled" || j.status === "in_progress") && (
                          <Link
                            href={j.status === "won" ? `/schedule?book=${j.id}` : "/schedule"}
                            className="mt-1.5 inline-block text-xs font-semibold hover:underline"
                            style={{ color: BLUE }}
                          >
                            {j.status === "won" ? "Book on the schedule" : "See the schedule"}
                          </Link>
                        )}
                        {checklistItems.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setOpenChecklist(j.id)}
                            aria-label={`Checklists for ${j.name}`}
                            className="mt-2 flex w-full flex-wrap items-center gap-1.5 text-left text-xs"
                          >
                            <CheckSquare className="h-3.5 w-3.5 text-[#5B6472]" />
                            {(["pre", "post"] as const).map((k) => {
                              const p = progress(j.id, k);
                              if (p.total === 0) return null;
                              const doneAll = p.done === p.total;
                              return (
                                <span
                                  key={k}
                                  className={`rounded-full px-2 py-0.5 font-semibold ${doneAll ? "bg-[#E3ECF8] text-[#163A69]" : "bg-[#ECEAE3] text-[#3F4753]"}`}
                                >
                                  {k === "pre" ? "Pre" : "Post"} {p.done}/{p.total}
                                </span>
                              );
                            })}
                          </button>
                        )}
                        {movable && (
                          <label className="mt-2 flex items-center gap-1.5 text-xs text-[#5B6472]">
                            Move to
                            <select
                              value={j.status}
                              onChange={(e) => move(j, e.target.value as JobStatus)}
                              aria-label={`Move ${j.name} to`}
                              className="min-w-0 flex-1 rounded border border-[#E3E1DA] bg-white px-1.5 py-1 text-xs text-[#16202E]"
                            >
                              {PRODUCTION_STAGES.filter((s) => s.status === j.status || canMoveTo(s.status, j.status)).map((s) => (
                                <option key={s.status} value={s.status}>
                                  {s.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </li>
                    );
                  })}
                  {cards.length === 0 && <li className="px-1 py-2 text-xs text-[#8A919C]">No jobs</li>}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      {openChecklist &&
        (() => {
          const job = jobs.find((j) => j.id === openChecklist);
          if (!job) return null;
          return (
            <div
              className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 py-[8vh]"
              onClick={(e) => e.target === e.currentTarget && setOpenChecklist(null)}
            >
              <div role="dialog" aria-modal="true" aria-label={`Checklists for ${job.name}`} className="max-h-[84vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
                <div className="flex items-start justify-between gap-3 px-5 py-4 text-white" style={{ background: NAVY }}>
                  <div>
                    {job.job_number && <p className="text-xs font-semibold text-white/80">{job.job_number}</p>}
                    <p className="font-semibold">{job.name}</p>
                  </div>
                  <button type="button" onClick={() => setOpenChecklist(null)} aria-label="Close" className="rounded p-1 hover:bg-white/10">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                {(["pre", "post"] as const).map((k) => {
                  const items = itemsOf(k);
                  if (items.length === 0) return null;
                  const p = progress(job.id, k);
                  return (
                    <section key={k} aria-label={CHECKLIST_NAMES[k]} className="border-b border-[#EFEDE7] px-5 py-4 last:border-0">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="font-semibold text-[#16202E]">{CHECKLIST_NAMES[k]}</h3>
                        <span className="text-sm text-[#5B6472]">
                          {p.done} of {p.total}
                        </span>
                      </div>
                      <ul className="flex flex-col gap-2">
                        {items.map((i) => {
                          const t = tickFor(job.id, i.id);
                          return (
                            <li key={i.id}>
                              <label className="flex cursor-pointer items-start gap-3 text-sm">
                                <input
                                  type="checkbox"
                                  checked={!!t}
                                  onChange={(e) => toggleTick(job.id, i.id, e.target.checked)}
                                  className="mt-0.5 h-4 w-4 accent-[#1F4E8C]"
                                />
                                <span>
                                  <span className={t ? "text-[#5B6472] line-through" : "text-[#16202E]"}>{i.label}</span>
                                  {t && (
                                    <span className="block text-xs text-[#8A919C]">
                                      {t.done_by_name ?? "Ticked"} · {shortDate(t.done_at)}
                                    </span>
                                  )}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
                {isAdmin && (
                  <p className="px-5 pb-4 text-xs text-[#5B6472]">
                    <Link href="/production/checklists" className="font-semibold hover:underline" style={{ color: BLUE }}>
                      Edit the checklist items
                    </Link>
                  </p>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
