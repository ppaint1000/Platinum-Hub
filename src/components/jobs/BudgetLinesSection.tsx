"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Money, Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { updateBudgetLineAction, deleteBudgetLineAction } from "@/app/jobs/budget/actions";
import { AddBudgetLineButton } from "./AddBudgetLineButton";

type CategoryOption = { id: string; label: string };

export type BudgetLineRow = {
  id: string;
  categoryId: string;
  categoryLabel: string;
  description: string;
  amount: number;
};

export function BudgetLinesSection({
  jobId,
  lines,
  categories,
}: {
  jobId: string;
  lines: BudgetLineRow[];
  categories: CategoryOption[];
}) {
  return (
    <Panel className="mb-8 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
        Budget lines — quoted $ by category ({lines.length})
      </h2>
      {lines.length === 0 ? (
        <p className="mb-3 text-sm text-ink-soft">
          Nothing budgeted yet. Add a line per category to price a job assessed by hand, rather
          than one that came through a Measures quote.
        </p>
      ) : (
        <div className="mb-3 space-y-1">
          {lines.map((line) => (
            <BudgetLineItem key={line.id} jobId={jobId} line={line} categories={categories} />
          ))}
        </div>
      )}
      <AddBudgetLineButton jobId={jobId} categories={categories} />
    </Panel>
  );
}

function BudgetLineItem({
  jobId,
  line,
  categories,
}: {
  jobId: string;
  line: BudgetLineRow;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [categoryId, setCategoryId] = useState(line.categoryId);
  const [description, setDescription] = useState(line.description);
  const [amount, setAmount] = useState(String(line.amount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await updateBudgetLineAction(line.id, jobId, {
      categoryId,
      description,
      amount: Number(amount) || 0,
    });

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

    const result = await deleteBudgetLineAction(line.id, jobId);
    setSaving(false);
    setConfirmingDelete(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (editing) {
    return (
      <form
        onSubmit={save}
        className="grid grid-cols-1 gap-2 rounded border border-line p-3 sm:grid-cols-[1fr_2fr_120px_auto_auto]"
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
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setEditing(false);
            setError(null);
          }}
        >
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

  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-4 text-sm">
        <div className="min-w-0">
          <span className="text-ink-soft">{line.description}</span>
          <span className="text-ink-faint"> — {line.categoryLabel}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Money value={line.amount} />
          {confirmingDelete ? (
            <>
              <span className="text-ink-faint">Delete this line?</span>
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
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-ink-faint underline hover:text-ink"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="underline"
                style={{ color: overBudgetColor }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {error && (
        <p className="mt-1 text-sm" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}
    </div>
  );
}
