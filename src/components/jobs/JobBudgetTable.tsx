"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Money, Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { setCategoryBudgetAction, deleteCategoryBudgetAction } from "@/app/jobs/budget/actions";
import { setCategoryActualAction } from "@/app/jobs/costs/actions";
import {
  CostLineItem,
  type CostLineRow,
  type CategoryOption,
  type JobOption,
} from "./CostLinesSection";

export type CategoryBudgetRow = {
  categoryId: string;
  categoryLabel: string;
  budgeted: number;
  actual: number;
  variance: number;
};

export function JobBudgetTable({
  jobId,
  rows,
  categoryLabels,
  costLines,
  categories,
  jobOptions,
}: {
  jobId: string;
  rows: CategoryBudgetRow[];
  categoryLabels: string[];
  costLines: CostLineRow[];
  categories: CategoryOption[];
  jobOptions: JobOption[];
}) {
  const datalistId = useId();

  return (
    <Panel className="mb-8 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
        Budget by category
      </h2>

      {rows.length === 0 ? (
        <p className="mb-3 text-sm text-ink-soft">
          Nothing budgeted or spent yet. Add a category below to set what a job assessed by hand
          should cost.
        </p>
      ) : (
        <table className="mb-3 w-full text-left text-sm">
          <thead className="border-b border-line">
            <tr>
              <th className="py-2 font-medium text-ink-faint">Category</th>
              <th className="py-2 pl-4 text-right font-medium text-ink-faint">Budgeted</th>
              <th className="py-2 pl-4 text-right font-medium text-ink-faint">Actual</th>
              <th className="py-2 pl-4 text-right font-medium text-ink-faint">Variance</th>
              <th className="py-2 pl-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => (
              <CategoryRow
                key={row.categoryId}
                jobId={jobId}
                row={row}
                costLines={costLines.filter((l) => l.categoryId === row.categoryId)}
                categories={categories}
                jobOptions={jobOptions}
              />
            ))}
          </tbody>
        </table>
      )}

      <AddCategoryBudgetForm jobId={jobId} datalistId={datalistId} categoryLabels={categoryLabels} />
    </Panel>
  );
}

function CategoryRow({
  jobId,
  row,
  costLines,
  categories,
  jobOptions,
}: {
  jobId: string;
  row: CategoryBudgetRow;
  costLines: CostLineRow[];
  categories: CategoryOption[];
  jobOptions: JobOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState(String(row.budgeted));
  const [actualAmount, setActualAmount] = useState(String(row.actual));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Budgeted and Actual are both editable here; only the ones that actually
  // changed get sent, so touching one doesn't rewrite the other.
  async function save() {
    setSaving(true);
    setError(null);

    const newBudget = Number(amount) || 0;
    const newActual = Number(actualAmount) || 0;

    if (newBudget !== row.budgeted) {
      const result = await setCategoryBudgetAction(jobId, {
        categoryName: row.categoryLabel,
        amount: newBudget,
      });
      if (result.error) {
        setSaving(false);
        setError(result.error);
        return;
      }
    }
    if (newActual !== row.actual) {
      const result = await setCategoryActualAction(jobId, {
        categoryId: row.categoryId,
        amount: newActual,
      });
      if (result.error) {
        setSaving(false);
        setError(result.error);
        router.refresh();
        return;
      }
    }

    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  function saveOnEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  }

  async function remove() {
    setSaving(true);
    setError(null);

    const result = await deleteCategoryBudgetAction(jobId, row.categoryId);
    setSaving(false);
    setConfirmingDelete(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <>
    <tr>
      <td className="py-2 text-ink">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-left hover:text-accent"
        >
          <span className="text-ink-faint">{expanded ? "▾" : "▸"}</span>
          {row.categoryLabel}
          <span className="text-ink-faint">({costLines.length})</span>
        </button>
      </td>
      {editing ? (
        <>
          <td className="py-2 pl-4 text-right">
            <input
              autoFocus
              type="number"
              step="0.01"
              aria-label={`${row.categoryLabel} budgeted`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={saveOnEnter}
              className="no-spinner w-28 rounded border border-line px-2 py-1 text-right text-sm"
            />
          </td>
          <td className="py-2 pl-4 text-right">
            <input
              type="number"
              step="0.01"
              aria-label={`${row.categoryLabel} actual`}
              value={actualAmount}
              onChange={(e) => setActualAmount(e.target.value)}
              onKeyDown={saveOnEnter}
              className="no-spinner w-28 rounded border border-line px-2 py-1 text-right text-sm"
            />
          </td>
          <td className="py-2 pl-4 text-right">
            <Money value={(Number(actualAmount) || 0) - (Number(amount) || 0)} variant="variance" />
          </td>
          <td className="py-2 pl-4">
            <div className="flex items-center justify-end gap-2">
              <Button onClick={save} disabled={saving}>
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
            </div>
            {error && (
              <p className="mt-1 text-right text-sm" style={{ color: overBudgetColor }}>
                {error}
              </p>
            )}
          </td>
        </>
      ) : (
        <>
          <td className="py-2 pl-4 text-right">
            <Money value={row.budgeted} />
          </td>
          <td className="py-2 pl-4 text-right">
            <Money value={row.actual} />
          </td>
          <td className="py-2 pl-4 text-right">
            <Money value={row.variance} variant="variance" />
          </td>
          <td className="py-2 pl-4">
            <div className="flex items-center justify-end gap-3 text-sm">
              {confirmingDelete ? (
                <>
                  <span className="text-ink-faint">Remove from this job?</span>
                  <button
                    type="button"
                    onClick={remove}
                    disabled={saving}
                    className="font-medium underline disabled:opacity-50"
                    style={{ color: overBudgetColor }}
                  >
                    {saving ? "Removing…" : "Confirm"}
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
                    onClick={() => {
                      setAmount(String(row.budgeted));
                      setActualAmount(String(row.actual));
                      setError(null);
                      setEditing(true);
                    }}
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
          </td>
        </>
      )}
    </tr>
    {expanded && (
      <tr>
        <td colSpan={5} className="bg-paper-raised/60 px-2 py-2">
          {costLines.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Nothing actually costed to this category yet.
            </p>
          ) : (
            <div className="space-y-1">
              {costLines.map((line) => (
                <CostLineItem
                  key={line.id}
                  jobId={jobId}
                  line={line}
                  categories={categories}
                  jobOptions={jobOptions}
                />
              ))}
            </div>
          )}
        </td>
      </tr>
    )}
    </>
  );
}

function AddCategoryBudgetForm({
  jobId,
  datalistId,
  categoryLabels,
}: {
  jobId: string;
  datalistId: string;
  categoryLabels: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await setCategoryBudgetAction(jobId, {
      categoryName,
      amount: Number(amount) || 0,
    });

    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCategoryName("");
    setAmount("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add category budget
      </Button>
    );
  }

  return (
    <form
      onSubmit={save}
      className="grid grid-cols-1 gap-2 rounded border border-line p-3 sm:grid-cols-[2fr_120px_auto_auto]"
    >
      <input
        required
        autoFocus
        list={datalistId}
        placeholder="Category — pick one or type a new one"
        value={categoryName}
        onChange={(e) => setCategoryName(e.target.value)}
        className="rounded border border-line px-2 py-1.5 text-sm"
      />
      <datalist id={datalistId}>
        {categoryLabels.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
      <input
        type="number"
        step="0.01"
        placeholder="Budgeted $"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="no-spinner rounded border border-line px-2 py-1.5 text-sm"
      />
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Add"}
      </Button>
      <Button variant="secondary" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error && (
        <p className="text-sm sm:col-span-4" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}
    </form>
  );
}
