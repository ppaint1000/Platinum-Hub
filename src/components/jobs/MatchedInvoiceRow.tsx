"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { overBudgetColor } from "@/design/tailwind.tokens";
import {
  moveInvoiceToJobAction,
  deleteInvoiceAction,
  fetchInvoiceLinesAction,
  splitInvoiceLinesAction,
} from "@/app/jobs/invoices/actions";

type JobOption = { id: string; name: string; job_number: string | null };
type LineOption = { id: string; description: string; subtotal: number };

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(n);
}

type Mode = "idle" | "change" | "unlink" | "delete" | "split";

// An invoice that's already linked to a job. Change job re-points it (and
// any costs already approved from it) at another job; Unlink takes it back
// off the job entirely, returning it to "Needs a job".
export function MatchedInvoiceRow({
  invoiceId,
  invoiceNumber,
  total,
  job,
  jobs,
}: {
  invoiceId: string;
  invoiceNumber: string | null;
  total: string | null;
  job: JobOption;
  jobs: JobOption[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [newJobId, setNewJobId] = useState("");
  const [lines, setLines] = useState<LineOption[] | null>(null);
  const [lineJobs, setLineJobs] = useState<Record<string, string>>({});
  const [loadingLines, setLoadingLines] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setMode("idle");
    setNewJobId("");
    setLines(null);
    setLineJobs({});
    setError(null);
  }

  async function startSplit() {
    setError(null);
    setMode("split");
    if (lines) return;
    setLoadingLines(true);
    const result = await fetchInvoiceLinesAction(invoiceId);
    setLoadingLines(false);
    if (result.error) {
      setError(result.error);
      setMode("idle");
      return;
    }
    setLines(result.lines ?? []);
    // Every line starts on this invoice's current job - splitting means
    // moving some of them elsewhere, not starting from nothing.
    setLineJobs(Object.fromEntries((result.lines ?? []).map((l) => [l.id, job.id])));
  }

  async function saveSplit() {
    if (!lines) return;
    setSaving(true);
    setError(null);
    const assignments = lines.map((l) => ({ lineId: l.id, jobId: lineJobs[l.id] ?? "" }));
    const result = await splitInvoiceLinesAction(invoiceId, assignments);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    close();
    router.refresh();
  }

  async function run(target: string | null) {
    setSaving(true);
    setError(null);
    const result = await moveInvoiceToJobAction(invoiceId, target);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    close();
    router.refresh();
  }

  async function remove() {
    setSaving(true);
    setError(null);
    const result = await deleteInvoiceAction(invoiceId);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded px-1 py-2 text-sm transition hover:bg-accent-soft/40">
      <div className="flex items-center justify-between gap-4">
        <Link href={`/jobs/${job.id}`} className="min-w-0 text-ink">
          Invoice {invoiceNumber ?? "—"}
          <span className="text-ink-faint"> — {job.name}</span>
        </Link>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-ink-soft">{total ?? "—"}</span>
          {mode === "idle" && (
            <>
              <button
                type="button"
                onClick={() => setMode("change")}
                className="text-ink-faint underline hover:text-ink"
              >
                Change job
              </button>
              <button
                type="button"
                onClick={() => setMode("unlink")}
                className="underline"
                style={{ color: overBudgetColor }}
              >
                Unlink
              </button>
              <button
                type="button"
                onClick={startSplit}
                className="text-ink-faint underline hover:text-ink"
              >
                Split across jobs
              </button>
              <button
                type="button"
                onClick={() => setMode("delete")}
                className="underline"
                style={{ color: overBudgetColor }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {mode === "change" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            autoFocus
            value={newJobId}
            onChange={(e) => setNewJobId(e.target.value)}
            className="max-w-xs rounded border border-line px-2 py-1.5 text-sm"
          >
            <option value="">Move to job…</option>
            {jobs
              .filter((j) => j.id !== job.id)
              .map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_number ? `${j.job_number} — ${j.name}` : j.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={() => run(newJobId)}
            disabled={saving || !newJobId}
            className="font-medium underline disabled:opacity-50"
          >
            {saving ? "Moving…" : "Move"}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="text-ink-faint underline hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <span className="text-ink-faint">Costs already approved from this invoice move with it.</span>
        </div>
      )}

      {mode === "unlink" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-ink-faint">
            Take this off “{job.name}”? Costs already approved from it are removed from that job and
            their invoice lines go back to pending.
          </span>
          <button
            type="button"
            onClick={() => run(null)}
            disabled={saving}
            className="font-medium underline disabled:opacity-50"
            style={{ color: overBudgetColor }}
          >
            {saving ? "Unlinking…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="text-ink-faint underline hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      {mode === "split" && (
        <div className="mt-2 space-y-2">
          {loadingLines ? (
            <p className="text-ink-faint">Loading lines…</p>
          ) : (
            <>
              {(lines ?? []).map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-ink-soft" title={l.description}>
                    {l.description}
                  </span>
                  <span className="w-20 shrink-0 text-right text-ink-faint">{fmtMoney(l.subtotal)}</span>
                  <select
                    value={lineJobs[l.id] ?? ""}
                    onChange={(e) => setLineJobs((prev) => ({ ...prev, [l.id]: e.target.value }))}
                    className="shrink-0 rounded border border-line px-2 py-1 text-sm"
                  >
                    <option value="">Choose job…</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.job_number ? `${j.job_number} — ${j.name}` : j.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveSplit}
                  disabled={saving}
                  className="font-medium underline disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save split"}
                </button>
                <button
                  type="button"
                  onClick={close}
                  disabled={saving}
                  className="text-ink-faint underline hover:text-ink disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {mode === "delete" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-ink-faint">
            Delete invoice {invoiceNumber ?? "this invoice"} entirely? Any cost already approved from
            it is removed from “{job.name}” too. This can’t be undone.
          </span>
          <button
            type="button"
            onClick={remove}
            disabled={saving}
            className="font-medium underline disabled:opacity-50"
            style={{ color: overBudgetColor }}
          >
            {saving ? "Deleting…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="text-ink-faint underline hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p className="mt-1 text-sm" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}
    </div>
  );
}
