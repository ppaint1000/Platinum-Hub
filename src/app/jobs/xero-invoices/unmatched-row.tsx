"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissXeroInvoiceAction, linkXeroInvoiceAction } from "@/app/jobs/xero-actions";

export function UnmatchedInvoiceRow({
  invoice,
  jobOptions,
}: {
  invoice: { id: string; number: string; date: string; customer: string; reference: string; amount: string };
  jobOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState("");
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) => startTransition(async () => {
    await fn();
    router.refresh();
  });

  return (
    <tr className="border-b border-line/60 align-top">
      <td className="px-3 py-2">
        <span className="font-mono font-semibold">{invoice.number}</span>
        <span className="block text-xs text-ink-soft">{new Date(`${invoice.date}T00:00:00`).toLocaleDateString("en-NZ")}</span>
      </td>
      <td className="px-3 py-2">{invoice.customer}</td>
      <td className="px-3 py-2 text-ink-soft">{invoice.reference || "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums">{invoice.amount}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-2">
          <select value={jobId} onChange={(e) => setJobId(e.target.value)} className="min-w-56 flex-1 rounded border border-line bg-white px-2 py-1.5 text-sm">
            <option value="">Choose the job…</option>
            {jobOptions.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </select>
          <button
            disabled={pending || !jobId}
            onClick={() => run(() => linkXeroInvoiceAction(invoice.id, jobId))}
            className="rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Add to job
          </button>
          <button
            disabled={pending}
            onClick={() => run(() => dismissXeroInvoiceAction(invoice.id))}
            className="rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-black/5"
            title="Not for a job - stop showing it"
          >
            Not a job
          </button>
        </div>
      </td>
    </tr>
  );
}
