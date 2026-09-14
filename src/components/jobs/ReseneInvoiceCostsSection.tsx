"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import {
  updateReseneInvoiceLineAction,
  approveReseneInvoiceLineAction,
} from "@/app/jobs/costs/actions";

type CategoryOption = { id: string; label: string };

export type ReseneInvoiceLineRow = {
  id: string;
  category_id: string | null;
  description: string;
  subtotal: number;
  status: "pending" | "approved";
  invoice: { invoice_number: string | null } | null;
};

export type AwaitingInvoiceOrderRow = {
  id: string;
  supplier: string;
  project: string;
  project_number: string | null;
  order_date: string;
};

export function ReseneInvoiceCostsSection({
  jobId,
  lines,
  awaitingInvoice,
  categories,
}: {
  jobId: string;
  lines: ReseneInvoiceLineRow[];
  awaitingInvoice: AwaitingInvoiceOrderRow[];
  categories: CategoryOption[];
}) {
  const pending = lines.filter((l) => l.status === "pending");

  if (pending.length === 0 && awaitingInvoice.length === 0) return null;

  return (
    <Panel className="mb-8 p-4">
      {pending.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Invoice lines — pending approval ({pending.length})
          </h2>
          <div className="mb-6 space-y-2">
            {pending.map((l) => (
              <PendingLineRow key={l.id} jobId={jobId} line={l} categories={categories} />
            ))}
          </div>
        </>
      )}

      {awaitingInvoice.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Awaiting invoice ({awaitingInvoice.length})
          </h2>
          <p className="mb-2 text-sm text-ink-soft">
            Resene orders on this job with no matching invoice yet — nothing to approve, just
            visibility.
          </p>
          <div className="space-y-1">
            {awaitingInvoice.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-1 text-sm">
                <span className="text-ink-soft">{o.supplier}</span>
                <span className="text-ink-faint">
                  PO {o.project_number ?? o.project} —{" "}
                  {new Date(o.order_date).toLocaleDateString("en-NZ")}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function PendingLineRow({
  jobId,
  line,
  categories,
}: {
  jobId: string;
  line: ReseneInvoiceLineRow;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(line.category_id ?? "");
  const [description, setDescription] = useState(line.description);
  const [amount, setAmount] = useState(String(line.subtotal));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setSaving(true);
    setError(null);

    const saveResult = await updateReseneInvoiceLineAction(line.id, jobId, {
      categoryId: categoryId || null,
      description,
      amount: Number(amount) || 0,
    });
    if (saveResult.error) {
      setSaving(false);
      setError(saveResult.error);
      return;
    }

    const approveResult = await approveReseneInvoiceLineAction(line.id, jobId);
    setSaving(false);
    if (approveResult.error) {
      setError(approveResult.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded border border-line p-3">
      {line.invoice?.invoice_number && (
        <span className="text-xs text-ink-faint">Invoice {line.invoice.invoice_number}</span>
      )}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_120px_auto]">
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded border border-line px-2 py-1.5 text-sm"
        >
          <option value="">Choose category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded border border-line px-2 py-1.5 text-sm"
        />
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="rounded border border-line px-2 py-1.5 text-sm"
        />
        <Button onClick={approve} disabled={saving}>
          {saving ? "Approving…" : "Approve"}
        </Button>
      </div>
      {error && (
        <p className="mt-2 text-sm" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}
    </div>
  );
}
