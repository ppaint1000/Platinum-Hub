"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, inputClass } from "@/components/quotes/Modal";
import { fmtCurrency } from "@/lib/quotes/format";

type SurfacePreset = {
  id: string;
  name: string;
  paint_product_id: string | null;
  labour_rate_per_sqm: number;
  coats: number;
  is_active: boolean;
};

type PaintProduct = { id: string; name: string };

type FormState = {
  name: string;
  paint_product_id: string;
  labour_rate_per_sqm: string;
  coats: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  name: "",
  paint_product_id: "",
  labour_rate_per_sqm: "",
  coats: "2",
  is_active: true,
};

export function SurfacePresetsClient({
  initialPresets,
  paintProducts,
}: {
  initialPresets: SurfacePreset[];
  paintProducts: PaintProduct[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<SurfacePreset | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productName = (id: string | null) =>
    paintProducts.find((p) => p.id === id)?.name ?? "—";

  function openAdd() {
    setForm(EMPTY);
    setError(null);
    setAdding(true);
  }

  function openEdit(p: SurfacePreset) {
    setForm({
      name: p.name,
      paint_product_id: p.paint_product_id ?? "",
      labour_rate_per_sqm: String(p.labour_rate_per_sqm),
      coats: String(p.coats),
      is_active: p.is_active,
    });
    setError(null);
    setEditing(p);
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
      paint_product_id: form.paint_product_id || null,
      labour_rate_per_sqm: Number(form.labour_rate_per_sqm) || 0,
      coats: Number(form.coats) || 1,
      is_active: form.is_active,
    };

    const { error } = editing
      ? await supabase.from("surface_presets").update(payload).eq("id", editing.id)
      : await supabase.from("surface_presets").insert(payload);

    setSaving(false);
    if (error) return setError("Couldn't save — " + error.message);

    close();
    router.refresh();
  }

  async function remove(p: SurfacePreset) {
    if (!confirm(`Delete ${p.name}? This can't be undone.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("surface_presets").delete().eq("id", p.id);
    if (error) return alert("Couldn't delete — " + error.message);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Surface Presets</h1>
          <p className="mt-1 text-sm text-muted">
            {initialPresets.length} preset{initialPresets.length === 1 ? "" : "s"} · used to
            quick-fill quote areas
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          Add preset
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {initialPresets.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No surface presets yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Name</th>
                <th className="hidden px-5 py-3 sm:table-cell">Paint product</th>
                <th className="hidden px-5 py-3 sm:table-cell">Rate/m²</th>
                <th className="hidden px-5 py-3 md:table-cell">Coats</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {initialPresets.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => openEdit(p)}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-background"
                >
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-ink">{p.name}</td>
                  <td className="hidden whitespace-nowrap px-5 py-3 text-muted sm:table-cell">
                    {productName(p.paint_product_id)}
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 sm:table-cell">
                    {fmtCurrency(p.labour_rate_per_sqm)}
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 md:table-cell">{p.coats}</td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        p.is_active ? "bg-green-50 text-green-700" : "bg-border/50 text-muted"
                      }`}
                    >
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(p);
                        }}
                        aria-label="Edit"
                        className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(p);
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
        <Modal title={editing ? "Edit preset" : "Add preset"} onClose={close} onSave={save} saving={saving}>
          <Field label="Name" required>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Interior walls — 2 coat"
            />
          </Field>
          <Field label="Paint product">
            <select
              className={inputClass}
              value={form.paint_product_id}
              onChange={(e) => setForm({ ...form, paint_product_id: e.target.value })}
            >
              <option value="">None</option>
              {paintProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Labour rate ($/m²)" required>
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={form.labour_rate_per_sqm}
                onChange={(e) => setForm({ ...form, labour_rate_per_sqm: e.target.value })}
              />
            </Field>
            <Field label="Coats" required>
              <input
                type="number"
                className={inputClass}
                value={form.coats}
                onChange={(e) => setForm({ ...form, coats: e.target.value })}
              />
            </Field>
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
