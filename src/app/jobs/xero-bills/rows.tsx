"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { linkBillAction, setSupplierAction } from "./actions";

export function BillRow({
  bill,
  jobOptions,
}: {
  bill: { id: string; supplier: string; number: string; reference: string; date: string; amount: string };
  jobOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState("");
  const [remember, setRemember] = useState(!!bill.reference);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <tr className="border-b border-line/60 align-top">
      <td className="px-3 py-2 font-medium">
        {bill.supplier}
        <span className="block text-xs font-normal text-ink-soft">{new Date(`${bill.date}T00:00:00`).toLocaleDateString("en-NZ")}</span>
      </td>
      <td className="px-3 py-2">
        <span className="font-mono">{bill.number || "—"}</span>
        {bill.reference && <span className="block text-xs text-ink-soft">Ref: {bill.reference}</span>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{bill.amount}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
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
            onClick={() => run(() => linkBillAction(bill.id, jobId, remember ? bill.reference : null))}
            className="rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Add to job
          </button>
          <button
            disabled={pending}
            onClick={() => run(() => linkBillAction(bill.id, null, null))}
            className="rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-black/5"
            title="Not for a job - overheads"
          >
            Overheads
          </button>
        </div>
        {bill.reference && (
          <label className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember order {bill.reference} for this job
          </label>
        )}
      </td>
    </tr>
  );
}

export function SupplierRow({
  name,
  categoryId,
  excluded,
  categories,
}: {
  name: string;
  categoryId: string;
  excluded: boolean;
  categories: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const save = (cat: string, out: boolean) =>
    startTransition(async () => {
      await setSupplierAction(name, cat || null, out);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
      <span className={`min-w-56 flex-1 font-medium ${excluded ? "text-ink-faint line-through" : ""}`}>{name}</span>
      <select
        value={categoryId}
        disabled={pending || excluded}
        onChange={(e) => save(e.target.value, false)}
        className={`rounded border px-2 py-1.5 text-sm ${!categoryId && !excluded ? "border-amber-400 bg-amber-50" : "border-line bg-white"}`}
        aria-label={`Category for ${name}`}
      >
        <option value="">Category… (Other)</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-ink-soft">
        <input type="checkbox" checked={excluded} disabled={pending} onChange={(e) => save(categoryId, e.target.checked)} />
        Leave out
      </label>
    </div>
  );
}
