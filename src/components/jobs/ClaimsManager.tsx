"use client";

// What's been claimed (invoiced to the customer) on a job: add a claim,
// edit or delete one. "Claim the rest" fills in what's left to claim.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Panel } from "@/components/ui";
import { deleteClaimAction, saveClaimAction, type ClaimInput } from "@/app/jobs/finance-actions";
import { money, type Claim } from "@/lib/jobs/jobFinance";

const inputClass = "w-full rounded border border-line bg-white px-2 py-1.5 text-sm";
const todayNz = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
const nzDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });

function ClaimForm({
  initial,
  leftToClaim,
  onSave,
  onCancel,
  pending,
}: {
  initial: ClaimInput;
  leftToClaim: number;
  onSave: (c: ClaimInput) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [c, setC] = useState(initial);
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...c, amount: parseFloat(amount) || 0 });
      }}
      className="grid gap-3 rounded-md border border-line bg-paper p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <label className="space-y-1">
        <span className="text-xs font-semibold text-ink-soft">Date</span>
        <input type="date" required value={c.claimDate} onChange={(e) => setC({ ...c, claimDate: e.target.value })} className={inputClass} />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-ink-soft">Invoice number</span>
        <input value={c.reference} onChange={(e) => setC({ ...c, reference: e.target.value })} placeholder="e.g. INV-1042" className={inputClass} />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-ink-soft">Amount (excl GST)</span>
        <div className="flex gap-1">
          <input autoFocus type="number" step="0.01" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={inputClass} />
          {leftToClaim > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(Math.round(leftToClaim * 100) / 100))}
              className="shrink-0 rounded border border-line px-2 text-xs font-medium text-ink-soft hover:bg-black/5"
              title={`Fill in what's left to claim (${money(leftToClaim, true)})`}
            >
              Claim the rest
            </button>
          )}
        </div>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-ink-soft">Notes</span>
        <input value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} placeholder="e.g. 50% progress claim" className={inputClass} />
      </label>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <button type="submit" disabled={pending} className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save claim"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm font-medium text-ink-soft hover:bg-black/5">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ClaimsManager({ jobId, claims, contractValue }: { jobId: string; claims: Claim[]; contractValue: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState("");
  const claimed = claims.reduce((s, c) => s + c.amount, 0);
  const leftToClaim = contractValue - claimed;

  const run = (fn: () => Promise<{ error?: string }>, after?: () => void) => {
    setError("");
    startTransition(async () => {
      const r = await fn();
      if (r.error) return setError(r.error);
      after?.();
      router.refresh();
    });
  };

  return (
    <Panel className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Claims</h2>
        {editing !== "new" && (
          <button onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4" /> Add claim
          </button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-700">{error}</p>}

      {editing === "new" && (
        <div className="mb-4">
          <ClaimForm
            initial={{ claimDate: todayNz(), reference: "", amount: 0, notes: "" }}
            leftToClaim={leftToClaim}
            pending={pending}
            onCancel={() => setEditing(null)}
            onSave={(input) => run(() => saveClaimAction(jobId, null, input), () => setEditing(null))}
          />
        </div>
      )}

      {claims.length === 0 ? (
        editing !== "new" && <p className="text-sm text-ink-soft">Nothing claimed on this job yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="py-2 pr-2 font-semibold">Date</th>
                <th className="px-2 py-2 font-semibold">Invoice</th>
                <th className="px-2 py-2 font-semibold">Notes</th>
                <th className="px-2 py-2 text-right font-semibold">Amount</th>
                <th className="px-2 py-2 text-right font-semibold">Claimed to date</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c, i) => {
                const toDate = claims.slice(0, i + 1).reduce((s, x) => s + x.amount, 0);
                return editing === c.id ? (
                  <tr key={c.id}>
                    <td colSpan={6} className="py-2">
                      <ClaimForm
                        initial={{ claimDate: c.claim_date, reference: c.reference ?? "", amount: c.amount, notes: c.notes ?? "" }}
                        leftToClaim={leftToClaim + c.amount}
                        pending={pending}
                        onCancel={() => setEditing(null)}
                        onSave={(input) => run(() => saveClaimAction(jobId, c.id, input), () => setEditing(null))}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} className="border-b border-line/60">
                    <td className="py-2 pr-2 whitespace-nowrap">{nzDate(c.claim_date)}</td>
                    <td className="px-2 py-2 font-mono text-xs">{c.reference ?? "—"}</td>
                    <td className="px-2 py-2 text-ink-soft">{c.notes}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(c.amount, true)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-soft">
                      {money(toDate, true)}
                      {contractValue > 0 && <span className="block text-xs">{Math.round((toDate / contractValue) * 100)}%</span>}
                    </td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap">
                      <button onClick={() => setEditing(c.id)} className="rounded p-1.5 text-ink-soft hover:bg-black/5" title="Edit" aria-label="Edit claim">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => confirm(`Delete the ${money(c.amount, true)} claim from ${nzDate(c.claim_date)}?`) && run(() => deleteClaimAction(jobId, c.id))}
                        className="rounded p-1.5 text-ink-soft hover:bg-red-50 hover:text-red-700"
                        title="Delete"
                        aria-label="Delete claim"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
