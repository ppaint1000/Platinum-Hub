"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Field, inputClass } from "@/components/quotes/Modal";
import { SearchableSelect } from "@/components/quotes/SearchableSelect";
import { fmtCurrency } from "@/lib/quotes/format";

type PaintProduct = {
  id: string;
  name: string;
  brand: string | null;
  cost_per_litre: number;
  is_default: boolean;
};

type Settings = {
  id: string;
  labour_rate_sell: number;
  labour_rate_cost: number;
  paint_flat_addition: number;
  spread_rate_sqm_per_litre: number;
  overtime_pct: number;
  overtime_rate: number;
  overtime_default_enabled: boolean;
  repaint_coats: number;
  general_prep_rate_sqm_per_hr: number;
  markup_material_pct: number;
  markup_other_pct: number;
  negotiating_factor_pct: number;
  gst_pct: number;
  night_shift_allowance_rate: number;
  exterior_wash_rate: number;
  exterior_wash_markup_pct: number;
} | null;

type FormState = {
  labour_rate_sell: string;
  labour_rate_cost: string;
  paint_flat_addition: string;
  spread_rate_sqm_per_litre: string;
  overtime_pct: string;
  overtime_rate: string;
  overtime_default_enabled: boolean;
  repaint_coats: string;
  general_prep_rate_sqm_per_hr: string;
  markup_material_pct: string;
  markup_other_pct: string;
  negotiating_factor_pct: string;
  gst_pct: string;
  night_shift_allowance_rate: string;
  exterior_wash_rate: string;
  exterior_wash_markup_pct: string;
};

// Percentages are stored as fractions (0.20) but edited as whole numbers (20).
const pctToForm = (v: number) => String(v * 100);
const formToPct = (v: string) => (Number(v) || 0) / 100;

function toForm(s: Settings): FormState {
  if (!s) {
    return {
      labour_rate_sell: "55",
      labour_rate_cost: "30",
      paint_flat_addition: "1.60",
      spread_rate_sqm_per_litre: "12",
      overtime_pct: "20",
      overtime_rate: "4.00",
      overtime_default_enabled: false,
      repaint_coats: "2",
      general_prep_rate_sqm_per_hr: "50",
      markup_material_pct: "20",
      markup_other_pct: "20",
      negotiating_factor_pct: "-10",
      gst_pct: "15",
      night_shift_allowance_rate: "5.00",
      exterior_wash_rate: "70.00",
      exterior_wash_markup_pct: "20",
    };
  }
  return {
    labour_rate_sell: String(s.labour_rate_sell),
    labour_rate_cost: String(s.labour_rate_cost),
    paint_flat_addition: String(s.paint_flat_addition),
    spread_rate_sqm_per_litre: String(s.spread_rate_sqm_per_litre),
    overtime_pct: pctToForm(s.overtime_pct),
    overtime_rate: String(s.overtime_rate),
    overtime_default_enabled: s.overtime_default_enabled,
    repaint_coats: String(s.repaint_coats),
    general_prep_rate_sqm_per_hr: String(s.general_prep_rate_sqm_per_hr),
    markup_material_pct: pctToForm(s.markup_material_pct),
    markup_other_pct: pctToForm(s.markup_other_pct),
    negotiating_factor_pct: pctToForm(s.negotiating_factor_pct),
    gst_pct: pctToForm(s.gst_pct),
    night_shift_allowance_rate: String(s.night_shift_allowance_rate),
    exterior_wash_rate: String(s.exterior_wash_rate),
    exterior_wash_markup_pct: pctToForm(s.exterior_wash_markup_pct),
  };
}

export function RatesClient({
  settings,
  paintProducts,
}: {
  settings: Settings;
  paintProducts: PaintProduct[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(toForm(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const currentDefault = paintProducts.find((p) => p.is_default) ?? null;
  const [defaultPaintId, setDefaultPaintId] = useState<string | null>(currentDefault?.id ?? null);
  const [defaultPaintCost, setDefaultPaintCost] = useState(
    String(currentDefault?.cost_per_litre ?? "")
  );
  const [savingPaint, setSavingPaint] = useState(false);
  const [paintError, setPaintError] = useState<string | null>(null);
  const [paintSavedAt, setPaintSavedAt] = useState<number | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function pickDefaultPaint(id: string | null) {
    setDefaultPaintId(id);
    const product = paintProducts.find((p) => p.id === id);
    setDefaultPaintCost(product ? String(product.cost_per_litre) : "");
  }

  async function saveDefaultPaint() {
    if (!defaultPaintId) return setPaintError("Choose a paint.");
    setSavingPaint(true);
    setPaintError(null);
    const supabase = createClient();

    if (defaultPaintId !== currentDefault?.id) {
      const { error: clearErr } = await supabase
        .from("paint_products")
        .update({ is_default: false })
        .eq("is_default", true);
      if (clearErr) {
        setSavingPaint(false);
        return setPaintError("Couldn't save — " + clearErr.message);
      }
    }

    const { error } = await supabase
      .from("paint_products")
      .update({ is_default: true, cost_per_litre: Number(defaultPaintCost) || 0 })
      .eq("id", defaultPaintId);

    setSavingPaint(false);
    if (error) return setPaintError("Couldn't save — " + error.message);

    setPaintSavedAt(Date.now());
    router.refresh();
  }

  const defaultPaintSell =
    (Number(defaultPaintCost) || 0) * (1 + formToPct(form.markup_material_pct)) +
    (Number(form.paint_flat_addition) || 0);

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();

    const payload = {
      labour_rate_sell: Number(form.labour_rate_sell) || 0,
      labour_rate_cost: Number(form.labour_rate_cost) || 0,
      paint_flat_addition: Number(form.paint_flat_addition) || 0,
      spread_rate_sqm_per_litre: Number(form.spread_rate_sqm_per_litre) || 0,
      overtime_pct: formToPct(form.overtime_pct),
      overtime_rate: Number(form.overtime_rate) || 0,
      overtime_default_enabled: form.overtime_default_enabled,
      repaint_coats: Number(form.repaint_coats) || 0,
      general_prep_rate_sqm_per_hr: Number(form.general_prep_rate_sqm_per_hr) || 0,
      markup_material_pct: formToPct(form.markup_material_pct),
      markup_other_pct: formToPct(form.markup_other_pct),
      negotiating_factor_pct: formToPct(form.negotiating_factor_pct),
      gst_pct: formToPct(form.gst_pct),
      night_shift_allowance_rate: Number(form.night_shift_allowance_rate) || 0,
      exterior_wash_rate: Number(form.exterior_wash_rate) || 0,
      exterior_wash_markup_pct: formToPct(form.exterior_wash_markup_pct),
    };

    const { error } = settings
      ? await supabase.from("costing_settings").update(payload).eq("id", settings.id)
      : await supabase.from("costing_settings").insert(payload);

    setSaving(false);
    if (error) return setError("Couldn't save — " + error.message);

    setSavedAt(Date.now());
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold text-ink">Rates</h1>
      <p className="mt-1 text-sm text-muted">
        Company-wide defaults that pre-fill every new costing — the same figures as the yellow
        boxes at the top of the reference spreadsheet. Change these when your standard rates
        change; individual costings can still be adjusted per job.
      </p>

      {!settings && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No rates saved yet — showing spreadsheet defaults. Save to create the record.
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-3">
        {error && <p className="text-sm text-brand-red">{error}</p>}
        {!error && savedAt && <p className="text-sm text-muted">Saved.</p>}
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save rates"}
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-ink">Labour</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sell rate ($/hr)" required>
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={form.labour_rate_sell}
                onChange={(e) => set("labour_rate_sell", e.target.value)}
              />
            </Field>
            <Field label="Cost rate ($/hr)" required>
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={form.labour_rate_cost}
                onChange={(e) => set("labour_rate_cost", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Paint</h2>
          <p className="mt-1 mb-4 text-xs text-muted">
            The full paint list (Sonyx, X-200, etc.) is managed under{" "}
            <Link href="/costing/paint-products" className="text-brand-red-dark hover:underline">
              Paint Products
            </Link>
            . Set the company default here — it&apos;s what every costing line uses when no paint is
            specifically chosen.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Default paint">
              <SearchableSelect
                placeholder="Choose a default…"
                emptyLabel="No default"
                value={defaultPaintId}
                onChange={pickDefaultPaint}
                options={paintProducts.map((p) => ({
                  id: p.id,
                  label: p.name,
                  sublabel: p.brand ?? undefined,
                }))}
              />
            </Field>
            <Field label="Cost per litre ($)">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={defaultPaintCost}
                onChange={(e) => setDefaultPaintCost(e.target.value)}
                disabled={!defaultPaintId}
              />
            </Field>
            <Field label="Sell/litre (auto)">
              <div
                className={
                  inputClass +
                  " flex cursor-not-allowed items-center bg-border/40 text-muted focus:scale-100 focus:shadow-none"
                }
              >
                {fmtCurrency(defaultPaintSell)}
              </div>
            </Field>
          </div>

          <div className="mt-3 flex items-center justify-end gap-3">
            {paintError && <p className="text-sm text-brand-red">{paintError}</p>}
            {!paintError && paintSavedAt && <p className="text-sm text-muted">Saved.</p>}
            <button
              onClick={saveDefaultPaint}
              disabled={savingPaint}
              className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-background disabled:opacity-60"
            >
              {savingPaint ? "Saving…" : "Save default paint"}
            </button>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <Field label="Flat addition ($/litre, added to every paint's sell price)">
              <input
                type="number"
                step="0.01"
                className={inputClass + " max-w-40"}
                value={form.paint_flat_addition}
                onChange={(e) => set("paint_flat_addition", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-ink">Coverage &amp; preparation</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Spread rate (m²/litre)">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={form.spread_rate_sqm_per_litre}
                onChange={(e) => set("spread_rate_sqm_per_litre", e.target.value)}
              />
            </Field>
            <Field label="Repaint coats">
              <input
                type="number"
                className={inputClass}
                value={form.repaint_coats}
                onChange={(e) => set("repaint_coats", e.target.value)}
              />
            </Field>
            <Field label="General prep rate (m²/hr)">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={form.general_prep_rate_sqm_per_hr}
                onChange={(e) => set("general_prep_rate_sqm_per_hr", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Exterior wash</h2>
          <p className="mt-1 mb-4 text-xs text-muted">
            Automatically added as a line whenever a building is set to Exterior.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Rate ($/unit, cost)">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={form.exterior_wash_rate}
                onChange={(e) => set("exterior_wash_rate", e.target.value)}
              />
            </Field>
            <Field label="Mark-up (%)">
              <input
                type="number"
                step="0.1"
                className={inputClass}
                value={form.exterior_wash_markup_pct}
                onChange={(e) => set("exterior_wash_markup_pct", e.target.value)}
              />
            </Field>
            <Field label="Sell rate (auto)">
              <div
                className={
                  inputClass +
                  " flex cursor-not-allowed items-center bg-border/40 text-muted focus:scale-100 focus:shadow-none"
                }
              >
                {fmtCurrency(
                  (Number(form.exterior_wash_rate) || 0) *
                    (1 + formToPct(form.exterior_wash_markup_pct))
                )}
              </div>
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-ink">Mark-up &amp; tax</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mark-up on material (%)">
              <input
                type="number"
                step="0.1"
                className={inputClass}
                value={form.markup_material_pct}
                onChange={(e) => set("markup_material_pct", e.target.value)}
              />
            </Field>
            <Field label="Mark-up on other (%)">
              <input
                type="number"
                step="0.1"
                className={inputClass}
                value={form.markup_other_pct}
                onChange={(e) => set("markup_other_pct", e.target.value)}
              />
            </Field>
            <Field label="Negotiating factor (%)">
              <input
                type="number"
                step="0.1"
                className={inputClass}
                value={form.negotiating_factor_pct}
                onChange={(e) => set("negotiating_factor_pct", e.target.value)}
              />
            </Field>
            <Field label="GST (%)">
              <input
                type="number"
                step="0.1"
                className={inputClass}
                value={form.gst_pct}
                onChange={(e) => set("gst_pct", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-ink">Overtime</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Overtime uplift (%)">
              <input
                type="number"
                step="0.1"
                className={inputClass}
                value={form.overtime_pct}
                onChange={(e) => set("overtime_pct", e.target.value)}
              />
            </Field>
            <Field label="Overtime rate ($/hr extra)">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={form.overtime_rate}
                onChange={(e) => set("overtime_rate", e.target.value)}
              />
            </Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.overtime_default_enabled}
              onChange={(e) => set("overtime_default_enabled", e.target.checked)}
            />
            Default new costings to overtime on
          </label>

          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <p className="col-span-full -mt-1 text-xs text-muted">
              Night shift is now turned on per building/area on the costing itself — the rate
              below is just the default that seeds each new building/area.
            </p>
            <Field label="Night shift allowance ($/hr, cost) — default for new buildings/areas">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={form.night_shift_allowance_rate}
                onChange={(e) => set("night_shift_allowance_rate", e.target.value)}
              />
            </Field>
            <Field label="Sell (auto, + mark-up on other)">
              <div
                className={
                  inputClass +
                  " flex cursor-not-allowed items-center bg-border/40 text-muted focus:scale-100 focus:shadow-none"
                }
              >
                {fmtCurrency(
                  (Number(form.night_shift_allowance_rate) || 0) *
                    (1 + formToPct(form.markup_other_pct))
                )}
              </div>
            </Field>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          {error && <p className="text-sm text-brand-red">{error}</p>}
          {!error && savedAt && <p className="text-sm text-muted">Saved.</p>}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save rates"}
          </button>
        </div>
      </div>
    </div>
  );
}
