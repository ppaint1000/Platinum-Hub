"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { addManualActualCostAction } from "@/app/jobs/costs/actions";

type CategoryOption = { id: string; label: string };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function AddCostLineButton({
  jobId,
  categories,
}: {
  jobId: string;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await addManualActualCostAction(jobId, {
      categoryId,
      description,
      amount: Number(amount) || 0,
      incurredAt: todayISO(),
    });

    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDescription("");
    setAmount("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add cost line
      </Button>
    );
  }

  return (
    <form
      onSubmit={save}
      className="mt-3 grid grid-cols-1 gap-2 rounded border border-line p-3 sm:grid-cols-[1fr_2fr_120px_auto_auto]"
    >
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="rounded border border-line px-2 py-1.5 text-sm"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        required
        autoFocus
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="rounded border border-line px-2 py-1.5 text-sm"
      />
      <input
        type="number"
        step="0.01"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="rounded border border-line px-2 py-1.5 text-sm"
      />
      <Button type="submit" disabled={saving}>
        {saving ? "Adding…" : "Add"}
      </Button>
      <Button variant="secondary" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error && (
        <p className="text-sm sm:col-span-5" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}
    </form>
  );
}
