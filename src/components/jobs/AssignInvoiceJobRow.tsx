"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { assignInvoiceJobAction } from "@/app/jobs/invoices/actions";

type JobOption = { id: string; name: string; job_number: string | null };

export function AssignInvoiceJobRow({
  invoiceId,
  invoiceNumber,
  customerPoNumber,
  jobs,
}: {
  invoiceId: string;
  invoiceNumber: string | null;
  customerPoNumber: string | null;
  jobs: JobOption[];
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState("");
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

  return (
    <div className="rounded border border-line p-3">
      <div className="text-sm text-ink">
        Invoice {invoiceNumber ?? "—"}
        {customerPoNumber && <span className="text-ink-faint"> — PO {customerPoNumber}</span>}
      </div>
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
      {error && (
        <p className="mt-2 text-sm" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}
    </div>
  );
}
