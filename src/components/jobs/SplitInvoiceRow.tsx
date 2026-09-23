"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { splitInvoiceLinesAction, deleteInvoiceAction } from "@/app/jobs/invoices/actions";

type JobOption = { id: string; name: string; job_number: string | null };
type LineRow = {
  id: string;
  description: string;
  subtotal: number;
  job: { id: string; name: string; job_number: string | null } | null;
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(n);
}

function jobLabel(j: JobOption | null) {
  if (!j) return "—";
  return j.job_number ? `${j.job_number} — ${j.name}` : j.name;
}

// An invoice already split across jobs — shows what each line was
// assigned to, with a way to re-assign any of them or delete the whole
// invoice. "Change job"/"Unlink" aren't offered here since those apply to
// the invoice as a whole (see MatchedInvoiceRow) - editing is per line.
export function SplitInvoiceRow({
  invoiceId,
  invoiceNumber,
  jobs,
  lines,
}: {
  invoiceId: string;
  invoiceNumber: string | null;
  jobs: JobOption[];
  lines: LineRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [lineJobs, setLineJobs] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, l.job?.id ?? ""]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const assignments = lines
      .map((l) => ({ lineId: l.id, jobId: lineJobs[l.id] ?? "" }))
      .filter((a) => a.jobId);
    if (assignments.length < lines.length) {
      setSaving(false);
      setError("Choose a job for every line before saving.");
      return;
    }
    const result = await splitInvoiceLinesAction(invoiceId, assignments);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditing(false);
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
    <div className="rounded border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-ink">Invoice {invoiceNumber ?? "—"}</div>
        {!editing && !confirmingDelete && (
          <div className="flex shrink-0 items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => {
                setLineJobs(Object.fromEntries(lines.map((l) => [l.id, l.job?.id ?? ""])));
                setError(null);
                setEditing(true);
              }}
              className="text-ink-faint underline hover:text-ink"
            >
              Edit split
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="underline"
              style={{ color: overBudgetColor }}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {confirmingDelete ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-faint">
            Delete invoice {invoiceNumber ?? "this invoice"} entirely? This can’t be undone.
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
            onClick={() => setConfirmingDelete(false)}
            disabled={saving}
            className="text-ink-faint underline hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-ink-soft" title={l.description}>
                {l.description}
              </span>
              <span className="w-20 shrink-0 text-right text-ink-faint">{fmtMoney(l.subtotal)}</span>
              {editing ? (
                <select
                  value={lineJobs[l.id] ?? ""}
                  onChange={(e) => setLineJobs((prev) => ({ ...prev, [l.id]: e.target.value }))}
                  className="shrink-0 rounded border border-line px-2 py-1 text-sm"
                >
                  <option value="">Choose job…</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {jobLabel(j)}
                    </option>
                  ))}
                </select>
              ) : l.job ? (
                <Link href={`/jobs/${l.job.id}`} className="shrink-0 text-accent hover:text-accent-hover">
                  {jobLabel(l.job)}
                </Link>
              ) : (
                <span className="shrink-0 text-ink-faint">Unassigned</span>
              )}
            </div>
          ))}
          {editing && (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="font-medium underline disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                disabled={saving}
                className="text-ink-faint underline hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}
    </div>
  );
}
