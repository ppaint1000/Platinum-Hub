"use client";

// A job's variations: add one (name, price to the customer, extra cost
// budget and hours), change its status, edit or delete it. Approved ones
// add to the contract value and the budget.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui";
import { createVariationAction, deleteVariationAction, updateVariationAction, type VariationInput } from "@/app/jobs/finance-actions";
import { money, type Variation, type VariationStatus } from "@/lib/jobs/jobFinance";

const STATUS: Record<VariationStatus, { label: string; className: string }> = {
  pending: { label: "Waiting for approval", className: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", className: "bg-green-100 text-green-800" },
  declined: { label: "Declined", className: "bg-gray-200 text-gray-700" },
};

const empty: VariationInput = { name: "", status: "pending", amount: 0, budgetCategoryId: null, budgetAmount: 0, hours: 0, notes: "" };

const inputClass = "w-full rounded border border-line bg-white px-2 py-1.5 text-sm";

function VariationForm({
  initial,
  categories,
  onSave,
  onCancel,
  pending,
}: {
  initial: VariationInput;
  categories: { id: string; label: string }[];
  onSave: (v: VariationInput) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [v, setV] = useState(initial);
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : "");
  const [budget, setBudget] = useState(initial.budgetAmount ? String(initial.budgetAmount) : "");
  const [hours, setHours] = useState(initial.hours ? String(initial.hours) : "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...v, amount: parseFloat(amount) || 0, budgetAmount: parseFloat(budget) || 0, hours: parseFloat(hours) || 0 });
      }}
      className="grid gap-3 rounded-md border border-line bg-paper p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <label className="space-y-1 sm:col-span-2">
        <span className="text-xs font-semibold text-ink-soft">What&apos;s the variation?</span>
        <input autoFocus required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Paint the garage door" className={inputClass} />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-ink-soft">Price to the customer (excl GST)</span>
        <input type="number" step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={inputClass} />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-ink-soft">Status</span>
        <select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as VariationStatus })} className={inputClass}>
          <option value="pending">Waiting for approval</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-ink-soft">Extra cost budget</span>
        <input type="number" step="0.01" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="0.00" className={inputClass} />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-ink-soft">Budget category</span>
        <select value={v.budgetCategoryId ?? ""} onChange={(e) => setV({ ...v, budgetCategoryId: e.target.value || null })} className={inputClass}>
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-ink-soft">Extra hours</span>
        <input type="number" step="0.5" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" className={inputClass} />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-ink-soft">Notes</span>
        <input value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className={inputClass} />
      </label>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" disabled={pending} className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save variation"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm font-medium text-ink-soft hover:bg-black/5">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function VariationsManager({
  jobId,
  variations,
  categories,
}: {
  jobId: string;
  variations: Variation[];
  categories: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | "new" | null>(variations.length === 0 ? "new" : null);
  const [error, setError] = useState("");
  const categoryLabel = new Map(categories.map((c) => [c.id, c.label]));

  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) => {
    setError("");
    startTransition(async () => {
      const r = await fn();
      if (r.error) return setError(r.error);
      after?.();
      router.refresh();
    });
  };

  const toInput = (x: Variation): VariationInput => ({
    name: x.name,
    status: x.status,
    amount: x.amount,
    budgetCategoryId: x.budget_category_id,
    budgetAmount: x.budget_amount,
    hours: x.hours,
    notes: x.notes ?? "",
  });

  return (
    <Panel className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Variations</h2>
        {editing !== "new" && (
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> Add variation
          </button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}

      {editing === "new" && (
        <div className="mb-4">
          <VariationForm
            initial={empty}
            categories={categories}
            pending={pending}
            onCancel={() => setEditing(null)}
            onSave={(input) => run(() => createVariationAction(jobId, input), () => setEditing(null))}
          />
        </div>
      )}

      {variations.length === 0 ? (
        editing !== "new" && <p className="text-sm text-ink-soft">No variations on this job yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="py-2 pr-2 font-semibold">Ref</th>
                <th className="px-2 py-2 font-semibold">Variation</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 text-right font-semibold">Price</th>
                <th className="px-2 py-2 text-right font-semibold">Cost budget</th>
                <th className="px-2 py-2 text-right font-semibold">Hours</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {variations.map((x) =>
                editing === x.id ? (
                  <tr key={x.id}>
                    <td colSpan={7} className="py-2">
                      <VariationForm
                        initial={toInput(x)}
                        categories={categories}
                        pending={pending}
                        onCancel={() => setEditing(null)}
                        onSave={(input) => run(() => updateVariationAction(jobId, x.id, input), () => setEditing(null))}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={x.id} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-2 font-mono text-xs text-ink-faint">{x.reference}</td>
                    <td className="px-2 py-2">
                      <span className="font-medium text-ink">{x.name}</span>
                      {x.notes && <span className="block text-xs text-ink-soft">{x.notes}</span>}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={x.status}
                        disabled={pending}
                        onChange={(e) => run(() => updateVariationAction(jobId, x.id, { ...toInput(x), status: e.target.value as VariationStatus }))}
                        className={`rounded-full border-0 px-2 py-1 text-xs font-semibold ${STATUS[x.status].className}`}
                        aria-label={`Status of ${x.name}`}
                      >
                        <option value="pending">Waiting for approval</option>
                        <option value="approved">Approved</option>
                        <option value="declined">Declined</option>
                      </select>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(x.amount, true)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {x.budget_amount ? money(x.budget_amount, true) : "—"}
                      {x.budget_category_id && <span className="block text-xs text-ink-soft">{categoryLabel.get(x.budget_category_id)}</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{x.hours || "—"}</td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(x.id)} className="rounded p-1.5 text-ink-soft hover:bg-black/5" title="Edit" aria-label={`Edit ${x.name}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => confirm(`Delete variation ${x.reference ?? ""} "${x.name}"?`) && run(() => deleteVariationAction(jobId, x.id))}
                        className="rounded p-1.5 text-ink-soft hover:bg-red-50 hover:text-red-700"
                        title="Delete"
                        aria-label={`Delete ${x.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
