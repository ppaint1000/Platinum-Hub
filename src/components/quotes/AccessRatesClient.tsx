"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, inputClass } from "@/components/quotes/Modal";
import { fmtCurrency } from "@/lib/quotes/format";

type AccessRate = {
  id: string;
  name: string;
  rate_type: string;
  unit: string;
  cost: number;
  is_active: boolean;
};

type FormState = {
  name: string;
  rate_type: string;
  unit: string;
  cost: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  name: "",
  rate_type: "Hire",
  unit: "no.",
  cost: "",
  is_active: true,
};

function SellField({ value }: { value: number }) {
  return (
    <Field label="Sell (auto)">
      <div
        className={
          inputClass +
          " flex cursor-not-allowed items-center bg-border/40 text-muted focus:scale-100 focus:shadow-none"
        }
      >
        {fmtCurrency(value)}
      </div>
    </Field>
  );
}

export function AccessRatesClient({
  initialRates,
  markupOtherPct,
}: {
  initialRates: AccessRate[];
  markupOtherPct: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AccessRate | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sellOf = (cost: number) => cost * (1 + markupOtherPct);

  function openAdd() {
    setForm(EMPTY);
    setError(null);
    setAdding(true);
  }

  function openEdit(r: AccessRate) {
    setForm({
      name: r.name,
      rate_type: r.rate_type,
      unit: r.unit,
      cost: String(r.cost),
      is_active: r.is_active,
    });
    setError(null);
    setEditing(r);
  }

  function close() {
    setAdding(false);
    setEditing(null);
  }

  async function save() {
    if (!form.name.trim()) return setError("Name is required.");

    setSaving(true);
    setError(null);
    const supabase = createClient();

    const payload = {
      name: form.name.trim(),
      rate_type: form.rate_type.trim() || "Hire",
      // A blank unit stays blank (e.g. the Scaffold by m2 rates); only a
      // brand-new rate starts with "no." pre-filled in the form.
      unit: form.unit.trim(),
      cost: Number(form.cost) || 0,
      is_active: form.is_active,
      sort_order: editing ? undefined : initialRates.length,
    };

    const { error } = editing
      ? await supabase.from("costing_access_rates").update(payload).eq("id", editing.id)
      : await supabase.from("costing_access_rates").insert(payload);

    setSaving(false);
    if (error) return setError("Couldn't save — " + error.message);

    close();
    router.refresh();
  }

  async function remove(r: AccessRate) {
    if (!confirm(`Delete ${r.name} (${r.rate_type})? This can't be undone.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("costing_access_rates").delete().eq("id", r.id);
    if (error) return alert("Couldn't delete — " + error.message);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Access Equipment</h1>
          <p className="mt-1 text-sm text-muted">
            {initialRates.length} rate{initialRates.length === 1 ? "" : "s"} · scaffold, lifts,
            and other hire equipment used when costing a job. Cost is what the hire company
            charges; sell adds your mark-up on other ({(markupOtherPct * 100).toFixed(0)}%).
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          Add rate
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {initialRates.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No access equipment rates yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Equipment</th>
                <th className="hidden px-5 py-3 sm:table-cell">Rate type</th>
                <th className="hidden px-5 py-3 sm:table-cell">Unit</th>
                <th className="px-5 py-3">Cost</th>
                <th className="px-5 py-3">Sell</th>
                <th className="hidden px-5 py-3 lg:table-cell">Status</th>
                {/* Pinned to the right edge so Edit/Delete never scroll out of view. */}
                <th className="sticky right-0 bg-surface px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {initialRates.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => openEdit(r)}
                  className="group cursor-pointer border-b border-border last:border-b-0 hover:bg-background"
                >
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-ink">{r.name}</td>
                  <td className="hidden whitespace-nowrap px-5 py-3 text-muted sm:table-cell">
                    {r.rate_type}
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 text-muted sm:table-cell">
                    {r.unit}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">{fmtCurrency(r.cost)}</td>
                  <td className="whitespace-nowrap px-5 py-3 font-medium">
                    {fmtCurrency(sellOf(r.cost))}
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 lg:table-cell">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        r.is_active ? "bg-green-50 text-green-700" : "bg-border/50 text-muted"
                      }`}
                    >
                      {r.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="sticky right-0 whitespace-nowrap bg-surface px-3 py-3 group-hover:bg-background">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(r);
                        }}
                        aria-label="Edit"
                        className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(r);
                        }}
                        aria-label="Delete"
                        className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-brand-red"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(adding || editing) && (
        <Modal title={editing ? "Edit rate" : "Add rate"} onClose={close} onSave={save} saving={saving}>
          <Field label="Equipment name" required>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Mobile Scaffold 4m"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rate type">
              <input
                className={inputClass}
                value={form.rate_type}
                onChange={(e) => setForm({ ...form, rate_type: e.target.value })}
                placeholder="e.g. Day Rate, Cartage"
              />
            </Field>
            <Field label="Unit">
              <input
                className={inputClass}
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="e.g. day, no."
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cost ($)" required>
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })}
              />
            </Field>
            <SellField value={sellOf(Number(form.cost) || 0)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Active
          </label>
          {error && <p className="text-sm text-brand-red">{error}</p>}
        </Modal>
      )}
    </div>
  );
}
