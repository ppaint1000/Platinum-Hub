"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, inputClass } from "@/components/quotes/Modal";
import { fmtCurrency } from "@/lib/quotes/format";

type PaintProduct = {
  id: string;
  name: string;
  brand: string | null;
  cost_per_litre: number;
  coverage_sqm_per_litre: number;
  is_active: boolean;
  is_default: boolean;
};

type FormState = {
  name: string;
  brand: string;
  cost_per_litre: string;
  coverage_sqm_per_litre: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  name: "",
  brand: "",
  cost_per_litre: "",
  coverage_sqm_per_litre: "10",
  is_active: true,
};

function SellField({ value }: { value: number }) {
  return (
    <Field label="Sell/litre (auto)">
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

export function PaintProductsClient({
  initialProducts,
  markupMaterialPct,
  paintFlatAddition,
}: {
  initialProducts: PaintProduct[];
  markupMaterialPct: number;
  paintFlatAddition: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PaintProduct | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sellOf = (cost: number) => cost * (1 + markupMaterialPct) + paintFlatAddition;

  function openAdd() {
    setForm(EMPTY);
    setError(null);
    setAdding(true);
  }

  function openEdit(p: PaintProduct) {
    setForm({
      name: p.name,
      brand: p.brand ?? "",
      cost_per_litre: String(p.cost_per_litre),
      coverage_sqm_per_litre: String(p.coverage_sqm_per_litre),
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
      brand: form.brand.trim() || null,
      cost_per_litre: Number(form.cost_per_litre) || 0,
      coverage_sqm_per_litre: Number(form.coverage_sqm_per_litre) || 0,
      is_active: form.is_active,
    };

    const { error } = editing
      ? await supabase.from("paint_products").update(payload).eq("id", editing.id)
      : await supabase.from("paint_products").insert(payload);

    setSaving(false);
    if (error) return setError("Couldn't save — " + error.message);

    close();
    router.refresh();
  }

  async function remove(p: PaintProduct) {
    if (!confirm(`Delete ${p.name}? This can't be undone.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("paint_products").delete().eq("id", p.id);
    if (error) return alert("Couldn't delete — " + error.message);
    router.refresh();
  }

  async function setDefault(p: PaintProduct) {
    const supabase = createClient();
    // Only one paint can be the default — clear the old one first.
    const { error: clearErr } = await supabase
      .from("paint_products")
      .update({ is_default: false })
      .eq("is_default", true);
    if (clearErr) return alert("Couldn't set default — " + clearErr.message);

    const { error } = await supabase
      .from("paint_products")
      .update({ is_default: true })
      .eq("id", p.id);
    if (error) return alert("Couldn't set default — " + error.message);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Paint Products</h1>
          <p className="mt-1 text-sm text-muted">
            {initialProducts.length} product{initialProducts.length === 1 ? "" : "s"} · sell adds
            your mark-up on material ({(markupMaterialPct * 100).toFixed(0)}%) plus a{" "}
            {fmtCurrency(paintFlatAddition)} flat addition per litre. The starred product is the
            default used when a costing line has no paint chosen.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          Add product
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {initialProducts.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No paint products yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3" />
                <th className="px-5 py-3">Name</th>
                <th className="hidden px-5 py-3 sm:table-cell">Brand</th>
                <th className="px-5 py-3">Cost/litre</th>
                <th className="px-5 py-3">Sell/litre</th>
                <th className="hidden px-5 py-3 md:table-cell">Coverage (m²/L)</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {initialProducts.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => openEdit(p)}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-background"
                >
                  <td className="px-5 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDefault(p);
                      }}
                      aria-label={p.is_default ? "Default paint" : "Set as default paint"}
                      className={`rounded-md p-1 transition ${
                        p.is_default
                          ? "text-amber-500"
                          : "text-border hover:text-muted"
                      }`}
                    >
                      <Star className="h-4 w-4" fill={p.is_default ? "currentColor" : "none"} />
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-ink">{p.name}</td>
                  <td className="hidden whitespace-nowrap px-5 py-3 text-muted sm:table-cell">
                    {p.brand ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">{fmtCurrency(p.cost_per_litre)}</td>
                  <td className="whitespace-nowrap px-5 py-3 font-medium">
                    {fmtCurrency(sellOf(p.cost_per_litre))}
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 md:table-cell">
                    {p.coverage_sqm_per_litre}
                  </td>
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
        <Modal title={editing ? "Edit product" : "Add product"} onClose={close} onSave={save} saving={saving}>
          <Field label="Name" required>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Sonic Sheen"
            />
          </Field>
          <Field label="Brand">
            <input
              className={inputClass}
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              placeholder="e.g. Resene"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cost per litre ($)" required>
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={form.cost_per_litre}
                onChange={(e) => setForm({ ...form, cost_per_litre: e.target.value })}
              />
            </Field>
            <SellField value={sellOf(Number(form.cost_per_litre) || 0)} />
          </div>
          <Field label="Coverage (m²/L)" required>
            <input
              type="number"
              step="0.1"
              className={inputClass}
              value={form.coverage_sqm_per_litre}
              onChange={(e) => setForm({ ...form, coverage_sqm_per_litre: e.target.value })}
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
