"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, inputClass } from "@/components/quotes/Modal";

type SurfaceType = {
  id: string;
  name: string;
  category: string;
  unit: string;
  labour_productivity_sqm_per_hr: number;
  is_active: boolean;
};

type FormState = {
  name: string;
  category: string;
  unit: string;
  labour_productivity_sqm_per_hr: string;
  is_active: boolean;
};

const CATEGORIES = ["Internal", "External"];
const UNITS = ["m²/hr", "lm/hr", "no./hr"];

const EMPTY: FormState = {
  name: "",
  category: "Internal",
  unit: "m²/hr",
  labour_productivity_sqm_per_hr: "",
  is_active: true,
};

const FILTERS = ["All", "Internal", "External"] as const;

export function ProductionRatesClient({ initialRates }: { initialRates: SurfaceType[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SurfaceType | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");

  const visibleRates =
    filter === "All" ? initialRates : initialRates.filter((r) => r.category === filter);

  function openAdd() {
    setForm(EMPTY);
    setError(null);
    setAdding(true);
  }

  function openEdit(r: SurfaceType) {
    setForm({
      name: r.name,
      category: r.category,
      unit: r.unit,
      labour_productivity_sqm_per_hr: String(r.labour_productivity_sqm_per_hr),
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
      category: form.category,
      unit: form.unit,
      labour_productivity_sqm_per_hr: Number(form.labour_productivity_sqm_per_hr) || 0,
      is_active: form.is_active,
      sort_order: editing ? undefined : initialRates.length,
    };

    const { error } = editing
      ? await supabase.from("costing_surface_types").update(payload).eq("id", editing.id)
      : await supabase.from("costing_surface_types").insert(payload);

    setSaving(false);
    if (error) return setError("Couldn't save — " + error.message);

    close();
    router.refresh();
  }

  async function remove(r: SurfaceType) {
    if (!confirm(`Delete ${r.name}? This can't be undone.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("costing_surface_types").delete().eq("id", r.id);
    if (error) return alert("Couldn't delete — " + error.message);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Production Rates</h1>
          <p className="mt-1 text-sm text-muted">
            {initialRates.length} surface type{initialRates.length === 1 ? "" : "s"} · default
            painting productivity per surface, matching the reference spreadsheet
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          Add rate
        </button>
      </div>

      <div className="mb-4 flex gap-1 border-b border-border">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-none whitespace-nowrap border-b-2 px-3 pb-2.5 text-sm font-medium transition ${
              filter === f
                ? "border-brand-red text-brand-red-dark"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {f}
            {f !== "All" && (
              <span className="ml-1.5 text-xs text-muted">
                ({initialRates.filter((r) => r.category === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {visibleRates.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No production rates yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Surface</th>
                <th className="px-5 py-3">Category</th>
                <th className="hidden px-5 py-3 sm:table-cell">Unit</th>
                <th className="px-5 py-3">Rate</th>
                <th className="hidden px-5 py-3 sm:table-cell">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleRates.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => openEdit(r)}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-background"
                >
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-ink">{r.name}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-muted">{r.category}</td>
                  <td className="hidden whitespace-nowrap px-5 py-3 text-muted sm:table-cell">
                    {r.unit}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    {r.labour_productivity_sqm_per_hr} {r.unit}
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 sm:table-cell">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        r.is_active ? "bg-green-50 text-green-700" : "bg-border/50 text-muted"
                      }`}
                    >
                      {r.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
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
          <Field label="Surface name" required>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Walls - plaster (brush)"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select
                className={inputClass}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unit">
              <select
                className={inputClass}
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              >
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Productivity rate" required>
            <input
              type="number"
              step="0.1"
              className={inputClass}
              value={form.labour_productivity_sqm_per_hr}
              onChange={(e) => setForm({ ...form, labour_productivity_sqm_per_hr: e.target.value })}
            />
          </Field>
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
