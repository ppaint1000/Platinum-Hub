"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import {
  assignInvoiceJobAction,
  splitInvoiceLinesAction,
  deleteInvoiceAction,
} from "@/app/jobs/invoices/actions";

type JobOption = { id: string; name: string; job_number: string | null };
type LineOption = { id: string; description: string; subtotal: number };

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(n);
}

export function AssignInvoiceJobRow({
  invoiceId,
  invoiceNumber,
  supplierName,
  customerPoNumber,
  jobs,
  lines,
}: {
  invoiceId: string;
  invoiceNumber: string | null;
  supplierName: string | null;
  customerPoNumber: string | null;
  jobs: JobOption[];
  lines: LineOption[];
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState("");
  const [split, setSplit] = useState(false);
  const [lineJobs, setLineJobs] = useState<Record<string, string>>({});
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign() {
    setSaving(true);
    setError(null);
    const result = await assignInvoiceJobAction(invoiceId, jobId);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function saveSplit() {
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
        <div className="text-sm text-ink">
          {supplierName && <span className="font-medium">{supplierName}</span>} Invoice{" "}
          {invoiceNumber ?? "—"}
          {customerPoNumber && <span className="text-ink-faint"> — PO {customerPoNumber}</span>}
        </div>
        {!confirmingDelete && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="shrink-0 text-sm underline"
            style={{ color: overBudgetColor }}
          >
            Delete
          </button>
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
        <>
          {lines.length > 1 && (
            <label className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
              This invoice is split across jobs
            </label>
          )}

          {split ? (
            <div className="mt-2 space-y-2">
              {lines.map((l) => (
                <div key={l.id} className="flex items-center gap-2 text-sm">
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
              <Button onClick={saveSplit} disabled={saving}>
                {saving ? "Saving…" : "Save split"}
              </Button>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="rounded border border-line px-2 py-1.5 text-sm"
              >
                <option value="">Choose job…</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.job_number ? `${j.job_number} — ${j.name}` : j.name}
                  </option>
                ))}
              </select>
              <Button onClick={assign} disabled={saving}>
                {saving ? "Linking…" : "Link"}
              </Button>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="mt-2 text-sm" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}
    </div>
  );
}
