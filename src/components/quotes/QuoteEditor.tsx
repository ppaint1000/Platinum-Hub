"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Copy, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Field, Modal, inputClass } from "@/components/quotes/Modal";
import { copyCosting, nextVersionName } from "@/lib/quotes/copyCosting";
import { QuoteStatusChip } from "@/components/quotes/StatusChip";
import { SearchableSelect } from "@/components/quotes/SearchableSelect";
import { CustomerSelect } from "@/components/quotes/CustomerSelect";
import { fmtCurrency, fmtCurrencyWhole } from "@/lib/quotes/format";
import { pushQuoteToHub } from "@/lib/quotes/hubSync";
import { forgetCosting } from "@/lib/quotes/lastCosting";
import { setUnsavedGuard } from "@/lib/quotes/unsavedGuard";
import { isWashItem, washItemHours } from "@/lib/quotes/washItems";

type Quote = {
  id: string;
  customer_id: string;
  status: string;
  valid_until: string | null;
  negotiating_factor_pct: number | null;
  subtotal: number;
  total: number;
  location: string | null;
  project: string | null;
  // Per-costing labour rates; null = use the company rates from Rates.
  labour_sell_override: number | null;
  labour_cost_override: number | null;
  // Flat $ allowances entered on the Summary page (no mark-up).
  allowance_site?: number | null;
  allowance_other?: number | null;
};

type QuoteLineItem = {
  id: string;
  quote_id: string;
  // null = a general line item not tied to any particular building/area.
  building_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  // Only Exterior Wash carries this — its unit price stays the raw rate,
  // with the mark-up applied on top and shown as its own editable box
  // instead of being baked in like every other Other Item.
  markup_pct: number | null;
  line_total: number;
  sort_order: number;
  // Scaffold / Mobile Scaffold / EWP lines live in each area's Access items,
  // separate from Other items, and roll up into their own header total.
  is_access: boolean;
  // "Scaffold by m²" is a pair of lines (Scaffold EDT, then Scaffold hire)
  // sharing a group id; the hire line copies the EDT line's m² and text.
  scaffold_group: string | null;
  scaffold_role: "edt" | "hire" | null;
  // An option: priced on its own and left out of the total. Options sharing
  // a group are alternatives - the customer picks one (migration 031).
  is_option?: boolean;
  option_group?: string | null;
};

type BuildingLine = {
  id: string;
  building_id: string;
  surface_name: string;
  // 'surface' = normal area-based row. 'wash' is the time-based row behind
  // each area's Wash tick box (not shown in the table). 'hourly' is a plain
  // hours line: Qty in hrs × the labour sell rate. ('sundry' is retired.)
  line_type: "surface" | "wash" | "sundry" | "hourly";
  paint_product_id: string | null;
  girth: number;
  qty: number;
  coats: number;
  labour_rate: number;
  spread_rate: number;
  material_rate: number;
  prep_rate: number;
  hours: number;
  litres: number;
  cost: number;
  calc_rate: number;
  prep_hours: number;
  sort_order: number;
  // Not persisted — the value each rate started at (company/production-rate
  // default), so the UI can flag when someone's overridden it by hand.
  default_coats: number;
  default_labour_rate: number;
  default_spread_rate: number;
  default_prep_rate: number;
  // Wash line only. When set (a hand-entered wash), the line is priced like
  // an Other item — hours × unit price × (1 + mark-up) — not at the labour
  // rate. Null on every other line.
  unit_price: number | null;
  markup_pct: number | null;
};

type Building = {
  id: string;
  quote_id: string;
  name: string;
  sort_order: number;
  category: string;
  excludes: string;
  note: string;
  overtime_enabled: boolean;
  sheeting_up_enabled: boolean;
  sheeting_up_pct: number;
  night_shift_enabled: boolean;
  night_shift_rate: number;
  // Same formula as night shift, its own rate; only one of the two is ever on.
  out_of_hours_enabled: boolean;
  out_of_hours_rate: number;
  // Exterior buildings only: keeps the Wash line's hours in step with the
  // building's m². Off = the wash hours are entered by hand.
  auto_wash_enabled: boolean;
  // A whole area as an option - see QuoteLineItem.is_option.
  is_option?: boolean;
  option_group?: string | null;
  lines: BuildingLine[];
};

type Customer = { id: string; name: string };
type SurfaceType = {
  id: string;
  name: string;
  category: string;
  unit: string;
  labour_productivity_sqm_per_hr: number;
};
type PaintProduct = {
  id: string;
  name: string;
  brand: string | null;
  cost_per_litre: number;
  coverage_sqm_per_litre: number;
  is_default: boolean;
};
type AccessRate = {
  id: string;
  name: string;
  rate_type: string;
  unit: string;
  cost: number;
};

const STATUSES = ["draft", "draft_review", "sent", "accepted", "complete"];
const DELETABLE_STATUSES = ["draft", "draft_review"];
const STATUS_LABELS: Record<string, string> = {
  draft_review: "Draft to be checked",
};

// The recurring row template from the reference spreadsheet's Take Off
// blocks. Girth is the per-unit factor used for litres (windows/doors are
// measured as a count × girth rather than a direct area). Coats/Labour
// Rate/Spread Rate/Prep Rate are no longer hardcoded here — they're filled
// in from company Rates (and Production Rates, where a name matches) when
// a building is actually created.
const DEFAULT_SURFACE_ROWS: { name: string; girth: number }[] = [
  { name: "Ceilings", girth: 1 },
  { name: "Ceilings Detailed", girth: 1 },
  { name: "Walls", girth: 1 },
  { name: "Walls Detailed", girth: 1 },
  { name: "Windows", girth: 0.4 },
  { name: "Windows Detailed", girth: 0.4 },
  { name: "Doors", girth: 1 },
  { name: "Door frames", girth: 0.2 },
  { name: "Skirting", girth: 0.2 },
];

let tempCounter = 0;
function tempId() {
  tempCounter += 1;
  return `temp-${tempCounter}-${Date.now()}`;
}

function isTemp(id: string) {
  return id.startsWith("temp-");
}

function emptyLineItem(sortOrder: number, buildingId: string | null = null): QuoteLineItem {
  return {
    id: tempId(),
    quote_id: "",
    building_id: buildingId,
    description: "",
    quantity: 1,
    unit_price: 0,
    markup_pct: null,
    line_total: 0,
    sort_order: sortOrder,
    is_access: false,
    scaffold_group: null,
    scaffold_role: null,
  };
}

function emptyBuildingLine(
  buildingId: string,
  sortOrder: number,
  opts: {
    name: string;
    lineType?: "surface" | "wash" | "sundry" | "hourly";
    girth: number;
    coats: number;
    labourRate: number;
    spreadRate: number;
    prepRate: number;
  }
): BuildingLine {
  return {
    id: tempId(),
    building_id: buildingId,
    surface_name: opts.name,
    line_type: opts.lineType ?? "surface",
    paint_product_id: null,
    girth: opts.girth,
    qty: 0,
    coats: opts.coats,
    labour_rate: opts.labourRate,
    spread_rate: opts.spreadRate,
    material_rate: 0,
    prep_rate: opts.prepRate,
    hours: 0,
    litres: 0,
    cost: 0,
    calc_rate: 0,
    prep_hours: 0,
    sort_order: sortOrder,
    default_coats: opts.coats,
    default_labour_rate: opts.labourRate,
    default_spread_rate: opts.spreadRate,
    default_prep_rate: opts.prepRate,
    unit_price: null,
    markup_pct: null,
  };
}

// A hand-entered Wash line (has a unit price) is costed as an item, not at
// the labour rate — and so sits outside the Sheeting Up base.
function isPricedWash(l: { line_type: string; unit_price: number | null }) {
  return l.line_type === "wash" && l.unit_price != null;
}

// Best-effort match of a template row name (e.g. "Walls") against the
// Production Rates catalog for the building's category (e.g. "Walls -
// plaster (brush)") — exact name first, then "starts with" so generic
// template names still pick up a real productivity rate where one exists.
function matchSurfaceRate(
  templateName: string,
  category: string,
  surfaceTypes: SurfaceType[]
): number | null {
  const target = templateName.toLowerCase();
  const candidates = surfaceTypes.filter((s) => s.category === category);
  const exact = candidates.find((s) => s.name.toLowerCase() === target);
  if (exact) return exact.labour_productivity_sqm_per_hr;
  const prefixed = candidates.find((s) => s.name.toLowerCase().startsWith(target + " "));
  return prefixed ? prefixed.labour_productivity_sqm_per_hr : null;
}

// Matches the spreadsheet's Take Off formulas for a surface line:
// Hours = Qty × Coats ÷ Labour Rate (m²/hr productivity)
// Litres = Qty × Coats × Girth ÷ Spread Rate (m²/litre coverage)
// Cost = Hours × company labour sell rate + Litres × Material Rate ($/litre)
// Calc. Rate = Cost ÷ Qty · Prep = Qty ÷ Prep Rate (m²/hr)
//
// Wash and Sundry are time-based, not area-based, and use a different
// formula entirely: Labour Rate here means minutes per unit (e.g. 60 =
// one hour), and litres are a fixed fraction of hours rather than driven
// by a spread rate. Neither row has a Prep figure.
const TIME_BASED_LITRES_DIVISOR: Record<string, number> = { wash: 5, sundry: 2 };

function recalcLine(line: BuildingLine, labourSellRate: number): BuildingLine {
  if (line.line_type === "hourly") {
    // Qty is hours; the amount is simply hours × the labour sell rate.
    const cost = line.qty * labourSellRate;
    return {
      ...line,
      hours: Math.round(line.qty * 1000) / 1000,
      litres: 0,
      cost: Math.round(cost * 100) / 100,
      calc_rate: line.qty > 0 ? Math.round(labourSellRate * 100) / 100 : 0,
      prep_hours: 0,
    };
  }

  if (isPricedWash(line)) {
    // Qty is hours; priced exactly like an Other item: qty × unit × (1 + mark-up).
    const cost = line.qty * (line.unit_price ?? 0) * (1 + (line.markup_pct ?? 0));
    return {
      ...line,
      hours: Math.round(line.qty * 1000) / 1000,
      litres: 0,
      cost: Math.round(cost * 100) / 100,
      calc_rate: line.qty > 0 ? Math.round((cost / line.qty) * 100) / 100 : 0,
      prep_hours: 0,
    };
  }

  if (line.line_type === "wash" || line.line_type === "sundry") {
    const hours = (line.labour_rate * line.coats * line.qty) / 60;
    const litres = hours / TIME_BASED_LITRES_DIVISOR[line.line_type];
    const cost = hours * labourSellRate + litres * line.material_rate;
    const calc_rate = hours > 0 ? cost / hours : 0;

    return {
      ...line,
      hours: Math.round(hours * 1000) / 1000,
      litres: Math.round(litres * 1000) / 1000,
      cost: Math.round(cost * 100) / 100,
      calc_rate: Math.round(calc_rate * 100) / 100,
      prep_hours: 0,
    };
  }

  const hours = line.labour_rate > 0 ? (line.qty * line.coats) / line.labour_rate : 0;
  const litres = line.spread_rate > 0 ? (line.qty * line.coats * line.girth) / line.spread_rate : 0;
  const cost = hours * labourSellRate + litres * line.material_rate;
  const calc_rate = line.qty > 0 ? cost / line.qty : 0;
  const prep_hours = line.prep_rate > 0 ? line.qty / line.prep_rate : 0;

  return {
    ...line,
    hours: Math.round(hours * 1000) / 1000,
    litres: Math.round(litres * 1000) / 1000,
    cost: Math.round(cost * 100) / 100,
    calc_rate: Math.round(calc_rate * 100) / 100,
    prep_hours: Math.round(prep_hours * 1000) / 1000,
  };
}

function recalcLineItem(item: QuoteLineItem): QuoteLineItem {
  const markup = item.markup_pct ?? 0;
  const line_total =
    Math.round(item.quantity * item.unit_price * (1 + markup) * 100) / 100;
  return { ...item, line_total };
}

// "+ Add building / area" plus "+ Copy building / area", which opens a
// picker of the existing areas to duplicate. Shown at the top of the
// Buildings list and at the foot of each area, so it lives in one place.
function AddBuildingButtons({
  buildings,
  onAdd,
  onCopy,
}: {
  buildings: { id: string; name: string; category: string }[];
  onAdd: () => void;
  onCopy: (sourceId: string) => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button onClick={onAdd} className={addButtonClass}>
        <Plus className="h-3.5 w-3.5" />
        Add building / area
      </button>
      {picking ? (
        <div className="w-60">
          <SearchableSelect
            className="text-xs"
            placeholder="Choose building / area to copy…"
            emptyLabel="Cancel"
            autoOpen
            onClose={() => setPicking(false)}
            value={null}
            onChange={(id) => {
              if (id) onCopy(id);
              setPicking(false);
            }}
            options={buildings.map((b, i) => ({
              id: b.id,
              label: b.name.trim() || `Untitled area ${i + 1}`,
              sublabel: b.category,
            }))}
          />
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          disabled={buildings.length === 0}
          className={addButtonClass + " disabled:cursor-not-allowed disabled:opacity-50"}
        >
          <Plus className="h-3.5 w-3.5" />
          Copy building / area
        </button>
      )}
    </div>
  );
}

const SCAFFOLD_ROLE_TITLE ={ edt: "Scaffold EDT", hire: "Scaffold hire" } as const;

// A $ amount box that reads to two decimals ($1.50, not 1.5) like the Access
// Equipment list, but is still free to type into: while it has focus you edit
// the plain number, and it tidies to two decimals when you leave it.
function PriceInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <input
      type="number"
      step="0.01"
      className={className}
      value={editing ?? (value === 0 ? "" : value.toFixed(2))}
      onFocus={() => setEditing(value === 0 ? "" : String(value))}
      onChange={(e) => {
        setEditing(e.target.value);
        onChange(Number(e.target.value) || 0);
      }}
      onBlur={() => setEditing(null)}
    />
  );
}

// A box that shows a value but can't be typed into (the Scaffold hire line's
// copied text and quantity, the calculated Wash hours). It keeps the normal
// box look; the click just passes through it.
const READ_ONLY_CLASS = " pointer-events-none";
const COPIED_FIELD_TITLE = "Copied from the Scaffold EDT line above — change it there";

const addButtonClass =
  "flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-background";

// Scaffold/Mobile Scaffold/EWP/Exterior Wash/free-form quick-add block,
// shared between each building/area card (buildingId set) and the general
// section at the bottom (buildingId null). Its own component (rather than
// a function called inline in QuoteEditor's render) so each add-button's
// picker can hold its own open/closed state — every add control looks and
// behaves the same as "Add line item" until clicked.
function OtherItemsSection({
  kind,
  buildingId,
  heading,
  items,
  accessRates,
  accessSellOf,
  onAddMobileScaffold,
  onAddEwp,
  onAddScaffoldByM2,
  onAddLineItem,
  onUpdateLineItem,
  onRemoveLineItem,
  qtyUnitSuffix,
}: {
  kind: "access" | "other";
  buildingId: string | null;
  heading: string;
  items: QuoteLineItem[];
  accessRates: AccessRate[];
  accessSellOf: (cost: number) => number;
  onAddMobileScaffold: (rateId: string, buildingId: string | null) => void;
  onAddEwp: (rateId: string, buildingId: string | null) => void;
  onAddScaffoldByM2: (buildingId: string | null) => void;
  onAddLineItem: (buildingId: string | null, isAccess?: boolean) => void;
  onUpdateLineItem: (id: string, patch: Partial<QuoteLineItem>) => void;
  onRemoveLineItem: (id: string) => void;
  qtyUnitSuffix: (description: string) => string | null;
}) {
  const [openPicker, setOpenPicker] = useState<"mobile" | "ewp" | null>(null);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{heading}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Add Scaffold adds the Scaffold EDT + Scaffold hire pair straight
              away (no picker), the same as Add scaffold by m². */}
          {kind === "access" && (
            <button onClick={() => onAddScaffoldByM2(buildingId)} className={addButtonClass}>
              <Plus className="h-3.5 w-3.5" />
              Add Scaffold
            </button>
          )}

          {kind === "access" && (
            <button onClick={() => onAddScaffoldByM2(buildingId)} className={addButtonClass}>
              <Plus className="h-3.5 w-3.5" />
              Add scaffold by m²
            </button>
          )}

          {kind === "access" && openPicker === "mobile" ? (
            <div className="w-52">
              <SearchableSelect
                className="text-xs"
                placeholder="Choose mobile scaffold…"
                emptyLabel="Cancel"
                autoOpen
                onClose={() => setOpenPicker(null)}
                value={null}
                onChange={(id) => {
                  if (id) onAddMobileScaffold(id, buildingId);
                  setOpenPicker(null);
                }}
                options={accessRates
                  .filter(
                    (r) =>
                      r.name.toLowerCase().startsWith("mobile scaffold") &&
                      !r.name.toLowerCase().includes("erect") &&
                      !r.name.toLowerCase().includes("transport")
                  )
                  .map((r) => ({
                    id: r.id,
                    label: r.name,
                    sublabel: fmtCurrency(accessSellOf(r.cost)),
                  }))}
              />
            </div>
          ) : (
            kind === "access" && (
              <button onClick={() => setOpenPicker("mobile")} className={addButtonClass}>
                <Plus className="h-3.5 w-3.5" />
                Add Mobile Scaffold
              </button>
            )
          )}

          {kind === "access" && openPicker === "ewp" ? (
            <div className="w-52">
              <SearchableSelect
                className="text-xs"
                placeholder="Choose EWP…"
                emptyLabel="Cancel"
                autoOpen
                onClose={() => setOpenPicker(null)}
                value={null}
                onChange={(id) => {
                  if (id) onAddEwp(id, buildingId);
                  setOpenPicker(null);
                }}
                options={accessRates
                  .filter((r) => !r.name.toLowerCase().includes("scaffold"))
                  .map((r) => ({
                    id: r.id,
                    label: r.name,
                    sublabel: fmtCurrency(accessSellOf(r.cost)),
                  }))}
              />
            </div>
          ) : (
            kind === "access" && (
              <button onClick={() => setOpenPicker("ewp")} className={addButtonClass}>
                <Plus className="h-3.5 w-3.5" />
                Add EWP
              </button>
            )
          )}

          <button onClick={() => onAddLineItem(buildingId, kind === "access")} className={addButtonClass}>
            <Plus className="h-3.5 w-3.5" />
            Add line item
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted shadow-sm">
          {kind === "access" ? "No access items." : "No extra line items."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-3 py-2.5">Description</th>
                <th className="px-3 py-2.5">Qty</th>
                <th className="px-3 py-2.5">Unit price</th>
                <th className="px-3 py-2.5">Mark-up %</th>
                <th className="px-3 py-2.5">Total</th>
                <th className="px-3 py-2.5">Option</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2">
                    {item.scaffold_role ? (
                      <div className="flex items-center gap-2">
                        <span className="w-28 shrink-0 text-sm font-semibold text-ink">
                          {SCAFFOLD_ROLE_TITLE[item.scaffold_role]}
                        </span>
                        {/* On the hire line this is copied from the EDT line: it looks
                            like every other box, it just can't be typed into. */}
                        <div
                          className="w-full min-w-40"
                          title={item.scaffold_role === "hire" ? COPIED_FIELD_TITLE : undefined}
                        >
                          <input
                            className={
                              inputClass +
                              " w-full" +
                              (item.scaffold_role === "hire" ? READ_ONLY_CLASS : "")
                            }
                            value={item.description}
                            readOnly={item.scaffold_role === "hire"}
                            tabIndex={item.scaffold_role === "hire" ? -1 : undefined}
                            onChange={(e) =>
                              onUpdateLineItem(item.id, { description: e.target.value })
                            }
                          />
                        </div>
                      </div>
                    ) : (
                      <input
                        className={inputClass + " w-full min-w-48"}
                        value={item.description}
                        onChange={(e) => onUpdateLineItem(item.id, { description: e.target.value })}
                        placeholder="e.g. Scaffold hire"
                        list="line-item-names"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <div title={item.scaffold_role === "hire" ? COPIED_FIELD_TITLE : undefined}>
                        <input
                          type="number"
                          step="0.01"
                          className={
                            inputClass +
                            " w-20" +
                            (item.scaffold_role === "hire" ? READ_ONLY_CLASS : "")
                          }
                          value={item.quantity === 0 ? "" : item.quantity}
                          readOnly={item.scaffold_role === "hire"}
                          tabIndex={item.scaffold_role === "hire" ? -1 : undefined}
                          onChange={(e) =>
                            onUpdateLineItem(item.id, { quantity: Number(e.target.value) || 0 })
                          }
                        />
                      </div>
                      {item.scaffold_role && (
                        <span className="text-[10px] text-muted">
                          {item.scaffold_role === "edt" ? "item" : "wk"}
                        </span>
                      )}
                      {!item.scaffold_role && qtyUnitSuffix(item.description) && (
                        <span className="text-[10px] text-muted">
                          {qtyUnitSuffix(item.description)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <PriceInput
                      className={inputClass + " w-24"}
                      value={item.unit_price}
                      onChange={(n) => onUpdateLineItem(item.id, { unit_price: n })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {item.markup_pct !== null && (
                      <input
                        type="number"
                        step="0.1"
                        className={inputClass + " w-16"}
                        value={Math.round(item.markup_pct * 1000) / 10}
                        onChange={(e) =>
                          onUpdateLineItem(item.id, {
                            markup_pct: (Number(e.target.value) || 0) / 100,
                          })
                        }
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-medium">
                    {fmtCurrency(item.line_total)}
                  </td>
                  <td className="px-3 py-2">
                    <OptionControls
                      isOption={!!item.is_option}
                      group={item.option_group ?? ""}
                      onChange={(patch) => onUpdateLineItem(item.id, patch)}
                      compact
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {/* Swaps a line between Other items and Access items (which
                        is what the Access total counts). Scaffold-by-m² pairs
                        stay together, so they don't get one. */}
                    {!item.scaffold_role && (
                      <button
                        onClick={() => onUpdateLineItem(item.id, { is_access: kind !== "access" })}
                        aria-label={kind === "access" ? "Move to Other items" : "Move to Access items"}
                        title={kind === "access" ? "Move to Other items" : "Move to Access items"}
                        className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-ink"
                      >
                        <ArrowRightLeft className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => onRemoveLineItem(item.id)}
                      aria-label="Remove line item"
                      className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-brand-red"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function QuoteEditor({
  quote,
  initialBuildings,
  initialLineItems,
  customers,
  paintProducts,
  surfaceTypes,
  accessRates,
  labourRateSell: companyLabourRateSell,
  labourRateCost: companyLabourRateCost,
  gstRatePct,
  markupMaterialPct,
  markupOtherPct,
  negotiatingFactorPct: companyNegotiatingFactorPct,
  paintFlatAddition,
  repaintCoats,
  spreadRateSqmPerLitre,
  generalPrepRateSqmPerHr,
  exteriorWashRate,
  exteriorWashMarkupPct,
  nightShiftAllowanceRate,
  lineItemNames: initialLineItemNames,
}: {
  quote: Quote;
  initialBuildings: Building[];
  initialLineItems: QuoteLineItem[];
  customers: Customer[];
  paintProducts: PaintProduct[];
  surfaceTypes: SurfaceType[];
  accessRates: AccessRate[];
  labourRateSell: number;
  labourRateCost: number;
  gstRatePct: number;
  markupMaterialPct: number;
  markupOtherPct: number;
  negotiatingFactorPct: number;
  paintFlatAddition: number;
  repaintCoats: number;
  spreadRateSqmPerLitre: number;
  generalPrepRateSqmPerHr: number;
  exteriorWashRate: number;
  exteriorWashMarkupPct: number;
  nightShiftAllowanceRate: number;
  lineItemNames: string[];
}) {
  const router = useRouter();

  const [customerList, setCustomerList] = useState(customers);
  const [customerId, setCustomerId] = useState(quote.customer_id);
  const [status, setStatus] = useState(quote.status);
  const [location, setLocation] = useState(quote.location ?? "");
  const [project, setProject] = useState(quote.project ?? "");
  const [validUntil, setValidUntil] = useState(quote.valid_until ?? "");
  // Percentages are stored as fractions (0.20) but edited as whole numbers
  // (20) - same convention as company settings (RatesClient.tsx). Falls
  // back to the company default only for a quote from before this column
  // was seeded on creation.
  const [negotiatingFactorInput, setNegotiatingFactorInput] = useState(
    String((quote.negotiating_factor_pct ?? companyNegotiatingFactorPct) * 100)
  );
  const [labourSellOverride, setLabourSellOverride] = useState(
    quote.labour_sell_override != null ? String(quote.labour_sell_override) : ""
  );
  const [labourCostOverride, setLabourCostOverride] = useState(
    quote.labour_cost_override != null ? String(quote.labour_cost_override) : ""
  );
  const labourRateSell =
    Number(labourSellOverride) > 0 ? Number(labourSellOverride) : companyLabourRateSell;

  // Sundry lines are gone from the app (all were empty), so they aren't shown
  // and are cleared out of the database the next time this is saved.
  const [buildings, setBuildings] = useState<Building[]>(() =>
    initialBuildings.map((b) => ({ ...b, lines: b.lines.filter((l) => l.line_type !== "sundry") }))
  );
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>(initialLineItems);
  const [removedBuildingIds, setRemovedBuildingIds] = useState<string[]>([]);
  const [removedLineIds, setRemovedLineIds] = useState<string[]>(() =>
    initialBuildings.flatMap((b) => b.lines).filter((l) => l.line_type === "sundry").map((l) => l.id)
  );
  const [removedLineItemIds, setRemovedLineItemIds] = useState<string[]>([]);
  // Grows locally as new descriptions are typed, so a name entered earlier
  // in this same session is immediately reusable elsewhere on the page
  // without waiting for a save + reload round-trip.
  const [lineItemNames, setLineItemNames] = useState<string[]>(initialLineItemNames);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [deletingQuote, setDeletingQuote] = useState(false);

  // Warns before closing the tab, refreshing, or navigating to a new
  // address while there's something unsaved — browsers won't let a page
  // intercept just switching to another tab or app, only actually leaving
  // the page.
  const [dirty, setDirty] = useState(false);
  // Compares against the values from the previous run rather than using a
  // "first run" flag, so React's dev-mode double-run of effects on mount
  // doesn't count as an edit.
  const lastValues = useRef<unknown[] | null>(null);
  // Saving swaps the temporary ids for the real ones, which replaces the
  // buildings/line items arrays — that isn't an edit, so save() sets this to
  // have the next such change ignored.
  const justSaved = useRef(false);
  useEffect(() => {
    const values = [
      customerId,
      status,
      location,
      project,
      validUntil,
      negotiatingFactorInput,
      labourSellOverride,
      labourCostOverride,
      buildings,
      lineItems,
    ];
    const prev = lastValues.current;
    lastValues.current = values;
    if (!prev || values.every((v, i) => Object.is(v, prev[i]))) return;
    if (justSaved.current) {
      justSaved.current = false;
      return;
    }
    setDirty(true);
  }, [
    customerId,
    status,
    location,
    project,
    validUntil,
    negotiatingFactorInput,
    labourSellOverride,
    labourCostOverride,
    buildings,
    lineItems,
  ]);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const paintOptions = useMemo(
    () =>
      paintProducts.map((p) => ({ id: p.id, label: p.name, sublabel: p.brand ?? undefined })),
    [paintProducts]
  );

  // Same formula as the Rates and Paint Products pages: cost × (1 + mark-up
  // on material) + flat addition.
  function sellRateOf(paintProductId: string | null) {
    const product = paintProducts.find((p) => p.id === paintProductId);
    if (!product) return 0;
    return product.cost_per_litre * (1 + markupMaterialPct) + paintFlatAddition;
  }

  const defaultPaintProductId = useMemo(
    () => paintProducts.find((p) => p.is_default)?.id ?? null,
    [paintProducts]
  );

  // A line's own paint wins; otherwise fall back to the company-wide
  // default paint — so "no paint chosen" still prices at a sensible
  // standard rather than $0.
  function materialRateFor(linePaintId: string | null) {
    const effectiveId = linePaintId ?? defaultPaintProductId;
    return sellRateOf(effectiveId);
  }

  function recalcLineFull(line: BuildingLine): BuildingLine {
    const material_rate = materialRateFor(line.paint_product_id);
    return recalcLine({ ...line, material_rate }, labourRateSell);
  }

  // Same mark-up as Access Equipment's own admin page: cost × (1 + mark-up
  // on other).
  function accessSellOf(cost: number) {
    return cost * (1 + markupOtherPct);
  }

  // Flags a rate that's been manually overridden away from what it was
  // seeded with, so it stands out at a glance.
  function changedClass(current: number, def: number) {
    return current !== def ? " text-brand-red font-semibold" : "";
  }

  // Sheeting Up isn't its own line — it's a building-level uplift: a % of
  // every other line's hours in that building, costed at the labour sell
  // rate (matching the spreadsheet's "Sheeting Up" summary row).
  function sheetingUpFor(b: Building) {
    // A hand-priced wash and hourly items are costed as they stand (hours ×
    // their rate), so they aren't uplifted.
    const linesHours = b.lines
      .filter((l) => !isPricedWash(l) && l.line_type !== "hourly")
      .reduce((s, l) => s + l.hours, 0);
    const hours = b.sheeting_up_enabled ? b.sheeting_up_pct * linesHours : 0;
    const cost = hours * labourRateSell;
    return { hours, cost };
  }

  // Prep isn't its own row either — like Sheeting Up, it's turned into a
  // cost at the labour sell rate (the spreadsheet's "Preparation Summary"
  // row), rather than a line item in its own right.
  function prepCostFor(b: Building) {
    const prepHours = b.lines.reduce((s, l) => s + l.prep_hours, 0);
    return prepHours * labourRateSell;
  }

  // Surface/wash/sundry hours + prep hours combined — matches the
  // spreadsheet's "Hours" figure before Sheeting Up is added on top.
  function hoursFor(b: Building) {
    const linesHours = b.lines.reduce((s, l) => s + l.hours, 0);
    const prepHours = b.lines.reduce((s, l) => s + l.prep_hours, 0);
    return linesHours + prepHours;
  }

  // The building's grand total hours — Hours (surface + prep) plus
  // Sheeting Up's own hours. This is what Nightshift's quantity is driven
  // from, never hand-entered.
  function totalHoursFor(b: Building) {
    return hoursFor(b) + sheetingUpFor(b).hours;
  }

  // Nightshift allowance: a flat $/hr rate on the building's total hours,
  // marked up the same way Access Equipment is (cost x (1 + mark-up on
  // other)) — matches the reference spreadsheet's Nightshift allowance row.
  // "Out of hours" runs the same formula with its own rate; only one of the
  // two can be on for a building.
  function nightShiftFor(b: Building) {
    const rate = b.night_shift_enabled
      ? b.night_shift_rate
      : b.out_of_hours_enabled
        ? b.out_of_hours_rate
        : null;
    if (rate === null) return { hours: 0, cost: 0 };
    const hours = totalHoursFor(b);
    const sellRate = rate * (1 + markupOtherPct);
    return { hours, cost: hours * sellRate };
  }

  // Options (an area or item ticked "Option") are priced on their own and
  // left out of every total - price, hours, litres, access and margin, and
  // what's sent to the Hub. An option area takes its own items with it.
  const optionBuildingIds = new Set(buildings.filter((b) => b.is_option).map((b) => b.id));
  const isOptionItem = (i: QuoteLineItem) =>
    !!i.is_option || (i.building_id !== null && optionBuildingIds.has(i.building_id));
  const coreBuildings = buildings.filter((b) => !b.is_option);
  const coreItems = lineItems.filter((i) => !isOptionItem(i));

  const buildingsSubtotal = useMemo(
    () =>
      buildings.filter((b) => !b.is_option).reduce((sum, b) => {
        const linesCost = b.lines.reduce((s, l) => s + (l.cost || 0), 0);
        return sum + linesCost + prepCostFor(b) + sheetingUpFor(b).cost + nightShiftFor(b).cost;
      }, 0),
    [buildings, labourRateSell]
  );
  const itemsSubtotal = useMemo(() => {
    const optionAreas = new Set(buildings.filter((b) => b.is_option).map((b) => b.id));
    return lineItems
      .filter((i) => !i.is_option && !(i.building_id !== null && optionAreas.has(i.building_id)))
      .reduce((sum, i) => sum + (i.line_total || 0), 0);
  }, [lineItems, buildings]);
  const subtotal = Math.round((buildingsSubtotal + itemsSubtotal) * 100) / 100;
  // A whole-number percent in the field (e.g. -10) as a fraction (-0.10) for
  // the maths - negative reduces the total, same as the old flat $ discount
  // did, but now scales with the size of the job instead of a fixed amount.
  const negotiatingFactorPctNum = (Number(negotiatingFactorInput) || 0) / 100;
  const negotiatingFactorAmount = Math.round(subtotal * negotiatingFactorPctNum * 100) / 100;
  const taxRateNum = gstRatePct;
  const total = Math.round((subtotal + negotiatingFactorAmount) * (1 + taxRateNum / 100) * 100) / 100;

  // Exterior buildings need a wash before painting — by default its hours
  // aren't typed in, they follow straight from how much exterior area there
  // is: 75m² washed per hour. Kept in sync on every edit rather than seeded
  // once, so it always reflects the building's current surface total. A
  // building can opt out (auto_wash_enabled off) and enter the hours itself.
  function syncWash(b: Building): Building {
    if (b.category !== "External" || !b.auto_wash_enabled) return b;
    const washIndex = b.lines.findIndex((l) => l.line_type === "wash");
    if (washIndex === -1) return b;
    const exteriorM2 = b.lines
      .filter((l) => l.line_type === "surface")
      .reduce((s, l) => s + l.girth * l.qty, 0);
    const qty = Math.ceil(exteriorM2 / 75);
    if (b.lines[washIndex].qty === qty) return b;
    const lines = [...b.lines];
    lines[washIndex] = recalcLineFull({ ...lines[washIndex], qty });
    return { ...b, lines };
  }

  function setBuildingsSynced(updater: (prev: Building[]) => Building[]) {
    setBuildings((prev) => updater(prev).map(syncWash));
  }

  function updateBuilding(id: string, patch: Partial<Building>) {
    setBuildingsSynced((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  // Ticking Wash calculates the hours from the m² (syncWash) at the labour
  // rate. Unticking it clears the hours to be entered by hand, and starts the
  // line with the standard exterior-wash unit price and mark-up — the same
  // boxes an Other-items wash used — so it's priced hours × unit × (1 + mark-up).
  //
  // A building can reach here with no wash line at all - one created before
  // this tick box existed, or brought in from Site Measures - in which case
  // toggling it used to be a silent no-op (nothing to map over) and neither
  // the calculated box nor the hand-entry boxes ever appeared. Create the
  // line on first use instead, with the same template addBuilding() gives a
  // brand-new building.
  function setAutoWash(buildingId: string, enabled: boolean) {
    setBuildingsSynced((prev) =>
      prev.map((b) => {
        if (b.id !== buildingId) return b;
        const hasWashLine = b.lines.some((l) => l.line_type === "wash");
        const lines = hasWashLine
          ? b.lines.map((l) => {
              if (l.line_type !== "wash") return l;
              return enabled
                ? recalcLineFull({ ...l, unit_price: null, markup_pct: null })
                : recalcLineFull({
                    ...l,
                    qty: 0,
                    unit_price: exteriorWashRate,
                    markup_pct: exteriorWashMarkupPct,
                  });
            })
          : [
              ...b.lines,
              recalcLineFull({
                ...emptyBuildingLine(b.id, b.lines.length, {
                  name: "Wash (including detergent)",
                  lineType: "wash",
                  girth: 1,
                  coats: 1,
                  labourRate: 60,
                  spreadRate: spreadRateSqmPerLitre,
                  prepRate: 0,
                }),
                ...(enabled ? {} : { unit_price: exteriorWashRate, markup_pct: exteriorWashMarkupPct }),
              }),
            ];
        return { ...b, auto_wash_enabled: enabled, lines };
      })
    );
  }

  // Older costings kept each area's wash as a "Wash" line under Other items.
  // This folds those into the area's own Wash (hand-entered hours, with the
  // items' unit price and mark-up), so the hours and $ count in the area, the
  // totals and the Labour share. Only areas whose Wash is unticked and empty
  // are moved — otherwise combining the two would change the price.
  const isWashItemIn = (buildingId: string) => (i: QuoteLineItem) =>
    i.building_id === buildingId && isWashItem(i.description);

  const movableWash = buildings.filter((b) => {
    const wash = b.lines.find((l) => l.line_type === "wash");
    return (
      !!wash &&
      !b.auto_wash_enabled &&
      wash.qty === 0 &&
      lineItems.some(isWashItemIn(b.id))
    );
  });
  const strandedWashCount = lineItems.filter(
    (i) => isWashItem(i.description) && !movableWash.some((b) => b.id === i.building_id)
  ).length;

  function moveWashItemsIntoAreas() {
    setBuildingsSynced((prev) =>
      prev.map((b) => {
        if (!movableWash.some((m) => m.id === b.id)) return b;
        const items = lineItems.filter(isWashItemIn(b.id));
        const hours = items.reduce((s, i) => s + i.quantity, 0);
        const value = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
        const withMarkup = items.reduce(
          (s, i) => s + i.quantity * i.unit_price * (i.markup_pct ?? exteriorWashMarkupPct),
          0
        );
        // Weighted, so several lines at different prices keep the same total.
        const unit = hours > 0 ? value / hours : (items[0]?.unit_price ?? exteriorWashRate);
        const markup = value > 0 ? withMarkup / value : exteriorWashMarkupPct;
        return {
          ...b,
          lines: b.lines.map((l) =>
            l.line_type === "wash"
              ? recalcLineFull({ ...l, qty: hours, unit_price: unit, markup_pct: markup })
              : l
          ),
        };
      })
    );
    const ids = lineItems.filter((i) => movableWash.some((b) => isWashItemIn(b.id)(i))).map((i) => i.id);
    setRemovedLineItemIds((prev) => [...prev, ...ids.filter((x) => !isTemp(x))]);
    setLineItems((prev) => prev.filter((i) => !ids.includes(i.id)));
  }

  // Changing this costing's labour sell rate re-prices every line, since
  // each line's stored cost was worked out at the old rate.
  const lastRate = useRef(labourRateSell);
  useEffect(() => {
    if (lastRate.current === labourRateSell) return;
    lastRate.current = labourRateSell;
    setBuildingsSynced((prev) =>
      prev.map((b) => ({ ...b, lines: b.lines.map(recalcLineFull) }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labourRateSell]);

  function addBuilding() {
    const id = tempId();
    const category = "Internal";
    const surfaceLines = DEFAULT_SURFACE_ROWS.map((row, i) =>
      recalcLineFull(
        emptyBuildingLine(id, i, {
          name: row.name,
          girth: row.girth,
          coats: repaintCoats,
          labourRate: matchSurfaceRate(row.name, category, surfaceTypes) ?? 12,
          spreadRate: spreadRateSqmPerLitre,
          prepRate: generalPrepRateSqmPerHr,
        })
      )
    );
    // A generic catch-all row for anything that doesn't fit the fixed
    // surface list.
    const otherLine = recalcLineFull(
      emptyBuildingLine(id, surfaceLines.length, {
        name: "Other",
        girth: 1,
        coats: repaintCoats,
        labourRate: 12,
        spreadRate: spreadRateSqmPerLitre,
        prepRate: generalPrepRateSqmPerHr,
      })
    );
    // The time-based row behind the area's Wash tick box (Labour Rate =
    // minutes/unit, 60 = 1 hour; one coat). It isn't shown in the table —
    // the Wash section under it is where it's set.
    const washLine = recalcLineFull(
      emptyBuildingLine(id, surfaceLines.length + 1, {
        name: "Wash (including detergent)",
        lineType: "wash",
        girth: 1,
        coats: 1,
        labourRate: 60,
        spreadRate: spreadRateSqmPerLitre,
        prepRate: 0,
      })
    );
    const building: Building = {
      id,
      quote_id: quote.id,
      name: "",
      sort_order: buildings.length,
      category,
      excludes: "",
      note: "",
      overtime_enabled: false,
      sheeting_up_enabled: true,
      sheeting_up_pct: 0.1,
      night_shift_enabled: false,
      night_shift_rate: nightShiftAllowanceRate,
      out_of_hours_enabled: false,
      out_of_hours_rate: 0,
      auto_wash_enabled: true,
      lines: [...surfaceLines, otherLine, washLine],
    };
    setBuildingsSynced((prev) => [...prev, building]);
  }

  // A plain hours line at the bottom of the area's surfaces: type the hours
  // in the Qty column and it's costed at the labour sell rate.
  function addHourlyLine(buildingId: string) {
    setBuildingsSynced((prev) =>
      prev.map((b) =>
        b.id !== buildingId
          ? b
          : {
              ...b,
              lines: [
                ...b.lines,
                recalcLineFull(
                  emptyBuildingLine(buildingId, b.lines.length, {
                    name: "Hourly item",
                    lineType: "hourly",
                    girth: 1,
                    coats: 1,
                    labourRate: 60,
                    spreadRate: spreadRateSqmPerLitre,
                    prepRate: 0,
                  })
                ),
              ],
            }
      )
    );
  }

  // Duplicates an existing building/area — its details, every surface line,
  // and its own Access / Other items — as a new, unsaved area at the end.
  function copyBuilding(sourceId: string) {
    const source = buildings.find((b) => b.id === sourceId);
    if (!source) return;
    const id = tempId();
    setBuildingsSynced((prev) => [
      ...prev,
      {
        ...source,
        id,
        quote_id: quote.id,
        name: source.name ? `${source.name} (copy)` : "",
        sort_order: prev.length,
        lines: source.lines.map((l, i) => ({ ...l, id: tempId(), building_id: id, sort_order: i })),
      },
    ]);

    const items = lineItems.filter((i) => i.building_id === sourceId);
    if (items.length) {
      // Scaffold EDT/hire pairs stay paired, but as their own new pair.
      const newGroups = new Map<string, string>();
      const copies = items.map((i, n) => {
        let group = i.scaffold_group;
        if (group) {
          if (!newGroups.has(group)) newGroups.set(group, crypto.randomUUID());
          group = newGroups.get(group)!;
        }
        return {
          ...i,
          id: tempId(),
          building_id: id,
          scaffold_group: group,
          sort_order: lineItems.length + n,
        };
      });
      setLineItems((prev) => [...prev, ...copies]);
    }
  }

  function removeBuilding(id: string) {
    if (!isTemp(id)) setRemovedBuildingIds((prev) => [...prev, id]);
    setBuildingsSynced((prev) => prev.filter((b) => b.id !== id));
    // Its own scaffold/EWP/other items go with it.
    const orphaned = lineItems.filter((i) => i.building_id === id);
    if (orphaned.length) {
      setRemovedLineItemIds((prev) => [
        ...prev,
        ...orphaned.filter((i) => !isTemp(i.id)).map((i) => i.id),
      ]);
      setLineItems((prev) => prev.filter((i) => i.building_id !== id));
    }
  }

  function updateLine(buildingId: string, lineId: string, patch: Partial<BuildingLine>) {
    setBuildingsSynced((prev) =>
      prev.map((b) =>
        b.id !== buildingId
          ? b
          : {
              ...b,
              lines: b.lines.map((l) =>
                l.id === lineId ? recalcLineFull({ ...l, ...patch }) : l
              ),
            }
      )
    );
  }

  function setBuildingCategory(buildingId: string, category: string) {
    updateBuilding(buildingId, { category });
  }

  function addLine(buildingId: string) {
    setBuildingsSynced((prev) =>
      prev.map((b) =>
        b.id !== buildingId
          ? b
          : {
              ...b,
              lines: [
                ...b.lines,
                recalcLineFull(
                  emptyBuildingLine(buildingId, b.lines.length, {
                    name: "Other",
                    girth: 1,
                    coats: repaintCoats,
                    labourRate: 12,
                    spreadRate: spreadRateSqmPerLitre,
                    prepRate: generalPrepRateSqmPerHr,
                  })
                ),
              ],
            }
      )
    );
  }

  // Adds a line pre-filled from the Production Rates catalog — pulls in
  // the real labour productivity for that surface instead of the generic
  // default, matching whichever surface type was picked.
  function addSurfaceLine(buildingId: string, surfaceTypeId: string) {
    const surface = surfaceTypes.find((s) => s.id === surfaceTypeId);
    if (!surface) return;
    setBuildingsSynced((prev) =>
      prev.map((b) => {
        if (b.id !== buildingId) return b;
        const line = emptyBuildingLine(buildingId, b.lines.length, {
          name: surface.name,
          girth: 1,
          coats: repaintCoats,
          labourRate: surface.labour_productivity_sqm_per_hr,
          spreadRate: spreadRateSqmPerLitre,
          prepRate: generalPrepRateSqmPerHr,
        });
        return { ...b, lines: [...b.lines, recalcLineFull(line)] };
      })
    );
  }

  function removeLine(buildingId: string, lineId: string) {
    if (!isTemp(lineId)) setRemovedLineIds((prev) => [...prev, lineId]);
    setBuildingsSynced((prev) =>
      prev.map((b) =>
        b.id !== buildingId ? b : { ...b, lines: b.lines.filter((l) => l.id !== lineId) }
      )
    );
  }

  // Scaffold / Mobile Scaffold: a hire line + a plain "Erect / Dismantle"
  // line at whichever catalog rate matches (erectMatch tells the two
  // apart — "Mobile Scaffold erect/dismantle…" vs. a plain "Scaffold
  // erect/dismantle…"). Each is its own quote line item, tagged to
  // whichever building/area it was added from (or none, for the general
  // section) — so they can be added again and again, per area.
  function addScaffoldLine(
    rateId: string,
    erectMatch: (nameLower: string) => boolean,
    buildingId: string | null
  ) {
    const hire = accessRates.find((r) => r.id === rateId);
    if (!hire) return;
    setLineItems((prev) => {
      let next = [
        ...prev,
        recalcLineItem({
          ...emptyLineItem(prev.length, buildingId),
          is_access: true,
          description: `${hire.name} — hire`,
          quantity: 1,
          unit_price: hire.cost,
          markup_pct: markupOtherPct,
        }),
      ];
      const erect = accessRates.find((r) => erectMatch(r.name.toLowerCase()));
      if (erect) {
        next = [
          ...next,
          recalcLineItem({
            ...emptyLineItem(next.length, buildingId),
            is_access: true,
            description: "Erect / Dismantle",
            quantity: 1,
            unit_price: erect.cost,
            markup_pct: markupOtherPct,
          }),
        ];
      }
      return next;
    });
  }

  function addMobileScaffoldLine(rateId: string, buildingId: string | null) {
    addScaffoldLine(rateId, (n) => n.includes("erect") && n.startsWith("mobile"), buildingId);
  }

  // EWP hire + a transport line: two trips at a default $325 each (there's no
  // per-EWP transport rate in the catalog), still editable.
  function addEwpLine(rateId: string, buildingId: string | null) {
    const hire = accessRates.find((r) => r.id === rateId);
    if (!hire) return;
    setLineItems((prev) => [
      ...prev,
      recalcLineItem({
        ...emptyLineItem(prev.length, buildingId),
        is_access: true,
        description: `${hire.name} — hire`,
        quantity: 1,
        unit_price: hire.cost,
        markup_pct: markupOtherPct,
      }),
      recalcLineItem({
        ...emptyLineItem(prev.length + 1, buildingId),
        is_access: true,
        description: "Transport",
        quantity: 2,
        unit_price: 325,
        markup_pct: markupOtherPct,
      }),
    ]);
  }

  // Scaffold by m²: an EDT line and a hire line, added together and kept
  // directly under one another. m² and the text box are typed on the EDT
  // line; the hire line copies them (see updateLineItem). Each line starts
  // at its "Scaffold by m2 EDT" / "Scaffold by m2 hire" cost from Access
  // Equipment, and its unit price and mark-up stay editable.
  function addScaffoldByM2(buildingId: string | null) {
    const group = crypto.randomUUID();
    // The EDT text starts as the area's name (still editable); the hire line
    // copies it, as it does for every later edit.
    const areaName = buildings.find((b) => b.id === buildingId)?.name.trim() ?? "";
    const catalogCost = (role: "edt" | "hire") =>
      accessRates.find((r) => {
        const n = r.name.toLowerCase().replace(/m²/g, "m2");
        return n.includes("scaffold by m2") && n.includes(role);
      })?.cost ?? 0;
    setLineItems((prev) => [
      ...prev,
      ...(["edt", "hire"] as const).map((role, n) =>
        recalcLineItem({
          ...emptyLineItem(prev.length + n, buildingId),
          is_access: true,
          scaffold_group: group,
          scaffold_role: role,
          description: areaName,
          quantity: 0,
          unit_price: catalogCost(role),
          markup_pct: markupOtherPct,
        })
      ),
    ]);
  }

  function updateLineItem(id: string, patch: Partial<QuoteLineItem>) {
    setLineItems((prev) => {
      const next = prev.map((i) => (i.id === id ? recalcLineItem({ ...i, ...patch }) : i));
      const edited = next.find((i) => i.id === id);
      if (
        edited?.scaffold_role === "edt" &&
        edited.scaffold_group &&
        (patch.quantity !== undefined || patch.description !== undefined)
      ) {
        return next.map((i) =>
          i.scaffold_group === edited.scaffold_group && i.scaffold_role === "hire"
            ? recalcLineItem({ ...i, quantity: edited.quantity, description: edited.description })
            : i
        );
      }
      return next;
    });
    if (patch.description && !lineItems.find((i) => i.id === id)?.scaffold_role) {
      const name = patch.description.trim();
      if (name) {
        setLineItemNames((prev) =>
          prev.some((n) => n.toLowerCase() === name.toLowerCase()) ? prev : [...prev, name]
        );
      }
    }
  }

  function addLineItem(buildingId: string | null = null, isAccess = false) {
    setLineItems((prev) => [
      ...prev,
      {
        ...emptyLineItem(prev.length, buildingId),
        is_access: isAccess,
        markup_pct: markupOtherPct,
      },
    ]);
  }

  function removeLineItem(id: string) {
    // Removing a Scaffold EDT line takes its hire line with it.
    const target = lineItems.find((i) => i.id === id);
    const ids =
      target?.scaffold_role === "edt" && target.scaffold_group
        ? lineItems.filter((i) => i.scaffold_group === target.scaffold_group).map((i) => i.id)
        : [id];
    setRemovedLineItemIds((prev) => [...prev, ...ids.filter((x) => !isTemp(x))]);
    setLineItems((prev) => prev.filter((i) => !ids.includes(i.id)));
  }

  // The unit the Qty column is actually counting, inferred from what kind
  // of line it is — hire lines run by the week, Exterior Wash by the hour,
  // Transport by the trip. Free-form/Erect-Dismantle lines have none.
  function qtyUnitSuffix(description: string): string | null {
    if (description === "Exterior Wash") return "Hrs";
    if (description === "Transport") return "No";
    if (description.endsWith("— hire")) return "Wk";
    return null;
  }

  // A surface name typed into a costing that doesn't match anything in the
  // Production Rates catalog (for that building's Interior/Exterior
  // category) gets added there automatically, carrying over the girth and
  // labour rate it was given here — so next time it's one click instead of
  // a custom line. Best-effort: failing to catalog a surface shouldn't
  // block saving the actual costing.
  async function syncCustomSurfaceTypes(
    supabase: ReturnType<typeof createClient>
  ) {
    const known = new Set(
      surfaceTypes.map((s) => `${s.category}::${s.name.trim().toLowerCase()}`)
    );
    const seen = new Set<string>();
    const toInsert: {
      name: string;
      category: string;
      unit: string;
      labour_productivity_sqm_per_hr: number;
      default_girth: number;
      sort_order: number;
      is_active: boolean;
    }[] = [];

    for (const building of buildings) {
      for (const line of building.lines) {
        if (line.line_type !== "surface") continue;
        const name = line.surface_name.trim();
        if (!name) continue;
        const key = `${building.category}::${name.toLowerCase()}`;
        if (known.has(key) || seen.has(key)) continue;
        seen.add(key);
        toInsert.push({
          name,
          category: building.category,
          unit: "m²/hr",
          labour_productivity_sqm_per_hr: line.labour_rate,
          default_girth: line.girth,
          sort_order: surfaceTypes.length + toInsert.length,
          is_active: true,
        });
      }
    }

    if (toInsert.length === 0) return;
    const { error } = await supabase.from("costing_surface_types").insert(toInsert);
    if (error) console.error("[costing] syncing custom surface types failed", error);
  }

  // A line item description that isn't already in the catalog gets added
  // there, so it shows up on the dropdown for every costing from now on —
  // best-effort, same as syncCustomSurfaceTypes above.
  async function syncCustomLineItemNames(supabase: ReturnType<typeof createClient>) {
    const known = new Set(initialLineItemNames.map((n) => n.trim().toLowerCase()));
    const seen = new Set<string>();
    const toInsert: { name: string }[] = [];

    for (const item of lineItems) {
      if (item.scaffold_role) continue;
      const name = item.description.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (known.has(key) || seen.has(key)) continue;
      seen.add(key);
      toInsert.push({ name });
    }

    if (toInsert.length === 0) return;
    const { error } = await supabase
      .from("costing_line_item_names")
      .upsert(toInsert, { onConflict: "name", ignoreDuplicates: true });
    if (error) console.error("[costing] syncing custom line item names failed", error);
  }

  async function save(): Promise<boolean> {
    setError(null);
    if (!customerId) {
      setError("Choose a customer.");
      return false;
    }

    setSaving(true);
    const supabase = createClient();
    await syncCustomSurfaceTypes(supabase);
    await syncCustomLineItemNames(supabase);

    try {
      if (removedLineIds.length) {
        const { error: delErr } = await supabase
          .from("quote_building_lines")
          .delete()
          .in("id", removedLineIds);
        if (delErr) throw delErr;
      }
      if (removedBuildingIds.length) {
        const { error: delErr } = await supabase
          .from("quote_buildings")
          .delete()
          .in("id", removedBuildingIds);
        if (delErr) throw delErr;
      }
      if (removedLineItemIds.length) {
        const { error: delErr } = await supabase
          .from("quote_line_items")
          .delete()
          .in("id", removedLineItemIds);
        if (delErr) throw delErr;
      }

      // Line items tagged to a building need that building's real (not
      // temp) id — this map is filled in as each building is saved below.
      // Every insert's real id also gets written back into local state at
      // the end (updatedBuildings/updatedLineItems) — without that, a temp
      // id would still look unsaved on the next save() and get re-inserted
      // as a duplicate instead of updated.
      const buildingIdMap = new Map<string, string>();
      const updatedBuildings: Building[] = [];

      for (const [index, building] of buildings.entries()) {
        const buildingPayload = {
          quote_id: quote.id,
          name: building.name.trim(),
          sort_order: index,
          category: building.category,
          excludes: building.excludes.trim() || null,
          note: building.note.trim() || null,
          overtime_enabled: building.overtime_enabled,
          sheeting_up_enabled: building.sheeting_up_enabled,
          sheeting_up_pct: building.sheeting_up_pct,
          night_shift_enabled: building.night_shift_enabled,
          night_shift_rate: building.night_shift_rate,
          out_of_hours_enabled: building.out_of_hours_enabled,
          out_of_hours_rate: building.out_of_hours_rate,
          auto_wash_enabled: building.auto_wash_enabled,
          is_option: !!building.is_option,
          option_group: building.is_option ? building.option_group?.trim() || null : null,
        };

        let buildingId = building.id;
        if (isTemp(building.id)) {
          const { data, error: insErr } = await supabase
            .from("quote_buildings")
            .insert(buildingPayload)
            .select("id")
            .single();
          if (insErr) throw insErr;
          buildingId = data.id;
        } else {
          const { error: updErr } = await supabase
            .from("quote_buildings")
            .update(buildingPayload)
            .eq("id", building.id);
          if (updErr) throw updErr;
        }
        buildingIdMap.set(building.id, buildingId);

        const updatedLines: BuildingLine[] = [];
        for (const [lineIndex, line] of building.lines.entries()) {
          const linePayload = {
            building_id: buildingId,
            surface_name: line.surface_name.trim() || "Other",
            line_type: line.line_type,
            paint_product_id: line.paint_product_id,
            girth: line.girth,
            qty: line.qty,
            coats: line.coats,
            labour_rate: line.labour_rate,
            spread_rate: line.spread_rate,
            material_rate: line.material_rate,
            prep_rate: line.prep_rate,
            hours: line.hours,
            litres: line.litres,
            cost: line.cost,
            calc_rate: line.calc_rate,
            prep_hours: line.prep_hours,
            unit_price: line.unit_price,
            markup_pct: line.markup_pct,
            sort_order: lineIndex,
          };
          let lineId = line.id;
          if (isTemp(line.id)) {
            const { data, error: lineErr } = await supabase
              .from("quote_building_lines")
              .insert(linePayload)
              .select("id")
              .single();
            if (lineErr) throw lineErr;
            lineId = data.id;
          } else {
            const { error: lineErr } = await supabase
              .from("quote_building_lines")
              .update(linePayload)
              .eq("id", line.id);
            if (lineErr) throw lineErr;
          }
          updatedLines.push({ ...line, id: lineId, building_id: buildingId });
        }
        updatedBuildings.push({ ...building, id: buildingId, lines: updatedLines });
      }

      const updatedLineItems: QuoteLineItem[] = [];
      for (const [index, item] of lineItems.entries()) {
        const resolvedBuildingId = item.building_id
          ? buildingIdMap.get(item.building_id) ?? item.building_id
          : null;
        const payload = {
          quote_id: quote.id,
          building_id: resolvedBuildingId,
          description: item.description.trim(),
          quantity: item.quantity,
          unit_price: item.unit_price,
          markup_pct: item.markup_pct,
          line_total: item.line_total,
          is_access: item.is_access,
          scaffold_group: item.scaffold_group,
          scaffold_role: item.scaffold_role,
          is_option: !!item.is_option,
          option_group: item.is_option ? item.option_group?.trim() || null : null,
          sort_order: index,
        };
        let itemId = item.id;
        if (isTemp(item.id)) {
          const { data, error: rowErr } = await supabase
            .from("quote_line_items")
            .insert(payload)
            .select("id")
            .single();
          if (rowErr) throw rowErr;
          itemId = data.id;
        } else {
          const { error: rowErr } = await supabase
            .from("quote_line_items")
            .update(payload)
            .eq("id", item.id);
          if (rowErr) throw rowErr;
        }
        updatedLineItems.push({ ...item, id: itemId, building_id: resolvedBuildingId });
      }

      const { error: quoteErr } = await supabase
        .from("quotes")
        .update({
          customer_id: customerId,
          status,
          location: location.trim() || null,
          project: project.trim() || null,
          valid_until: validUntil || null,
          negotiating_factor_pct: negotiatingFactorPctNum,
          tax_rate: taxRateNum,
          labour_sell_override: Number(labourSellOverride) > 0 ? Number(labourSellOverride) : null,
          labour_cost_override: Number(labourCostOverride) > 0 ? Number(labourCostOverride) : null,
          subtotal,
          total,
        })
        .eq("id", quote.id);
      if (quoteErr) throw quoteErr;

      const totalHours = coreBuildings.reduce(
        (sum, b) => sum + b.lines.reduce((s, l) => s + (l.hours || 0), 0),
        0
      );
      pushQuoteToHub({
        id: quote.id,
        customerId: customerId || null,
        name: location.trim() || "Untitled quote",
        status,
        total,
        totalHours,
      });

      justSaved.current = true;
      setBuildings(updatedBuildings);
      setLineItems(updatedLineItems);
      setRemovedBuildingIds([]);
      setRemovedLineIds([]);
      setRemovedLineItemIds([]);
      setSavedAt(Date.now());
      setDirty(false);
      router.refresh();
      return true;
    } catch (e) {
      setError("Couldn't save — " + (e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Lets the tab bar ask "anything unsaved?" and save-or-discard before it
  // navigates away. Refs so it always sees the latest state and save().
  const dirtyRef = useRef(false);
  const saveRef = useRef(save);
  useEffect(() => {
    dirtyRef.current = dirty;
    saveRef.current = save;
  });
  useEffect(() => {
    setUnsavedGuard({
      isDirty: () => dirtyRef.current,
      save: () => saveRef.current(),
      discard: () => setDirty(false),
    });
    return () => setUnsavedGuard(null);
  }, []);

  async function deleteQuote() {
    if (!confirm("Delete this costing? This can't be undone.")) return;
    setDeletingQuote(true);
    const supabase = createClient();
    try {
      const buildingIds = buildings.filter((b) => !isTemp(b.id)).map((b) => b.id);
      if (buildingIds.length) {
        await supabase.from("quote_building_lines").delete().in("building_id", buildingIds);
      }
      await supabase.from("quote_buildings").delete().eq("quote_id", quote.id);
      await supabase.from("quote_line_items").delete().eq("quote_id", quote.id);
      await supabase.from("quotes").delete().eq("id", quote.id);
      forgetCosting(quote.id);
      setDirty(false);
      router.push("/costing");
    } finally {
      setDeletingQuote(false);
    }
  }

  // A Complete costing is locked: every field below is switched off except
  // Status (and Save), so the only way to edit it is to change its status.
  const locked = status === "complete";

  // Copy a Complete costing as a new Draft: the popup asks for a name
  // (pre-filled with "… V2"), then everything saved is duplicated.
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyName, setCopyName] = useState("");
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  function openCopy() {
    setCopyName(nextVersionName(location.trim() || project.trim()));
    setCopyError(null);
    setCopyOpen(true);
  }

  async function createCopy() {
    const name = copyName.trim();
    if (!name) return setCopyError("Enter a name for the copy.");
    setCopying(true);
    setCopyError(null);
    try {
      const copy = await copyCosting(quote.id, name);
      pushQuoteToHub({
        id: copy.id,
        customerId: copy.customerId,
        name,
        status: "draft",
        total: copy.total,
        totalHours: copy.totalHours,
      });
      router.push(`/costing/${copy.id}`);
    } catch (e) {
      setCopyError("Couldn't copy — " + (e as Error).message);
      setCopying(false);
    }
  }

  // Every option with its own price: an option area (with its own items) or
  // an option item. Grouped for the list under the totals.
  const areaPrice = (b: Building) =>
    b.lines.reduce((s, l) => s + (l.cost || 0), 0) + prepCostFor(b) + sheetingUpFor(b).cost + nightShiftFor(b).cost;
  const optionRows = [
    ...buildings
      .filter((b) => b.is_option)
      .map((b) => ({
        key: b.id,
        name: b.name.trim() || "Untitled area",
        group: b.option_group?.trim() ?? "",
        price: areaPrice(b) + lineItems.filter((i) => i.building_id === b.id).reduce((s, i) => s + (i.line_total || 0), 0),
      })),
    ...lineItems
      .filter((i) => i.is_option && !(i.building_id !== null && optionBuildingIds.has(i.building_id)))
      .map((i) => ({
        key: i.id,
        name: i.description.trim() || "Untitled item",
        group: i.option_group?.trim() ?? "",
        price: i.line_total || 0,
      })),
  ];
  const optionGroups = [...new Set(optionRows.map((r) => r.group))]
    .sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map((g) => [g, optionRows.filter((r) => r.group === g)] as const);

  // The same figures shown at the foot of each area, added up across every
  // area (other items aren't part of an area's Amount, so they aren't here).
  const allAreas = coreBuildings.reduce(
    (t, b) => ({
      totalHours: t.totalHours + totalHoursFor(b),
      litres: t.litres + b.lines.reduce((s, l) => s + l.litres, 0),
    }),
    { totalHours: 0, litres: 0 }
  );
  // Scaffold / Mobile Scaffold / EWP lines from every area, added together.
  const accessTotal = coreItems
    .filter((i) => i.is_access)
    .reduce((s, i) => s + (i.line_total || 0), 0);

  // Each category's share of the job's total cost — the reference
  // spreadsheet's Repaint Costs block (Take Off I13:I16): Labour, Material,
  // Access and Other, each as cost ÷ (the four added together). Costs, not
  // sell values, and blank when a category has none.
  const labourCostRate =
    Number(labourCostOverride) > 0 ? Number(labourCostOverride) : companyLabourRateCost;
  const itemCost = (i: QuoteLineItem) =>
    i.markup_pct !== null ? i.unit_price * i.quantity : i.line_total / (1 + markupOtherPct);
  const materialCost = coreBuildings.reduce(
    (sum, b) =>
      sum +
      b.lines.reduce((s, l) => {
        const product = paintProducts.find(
          (p) => p.id === (l.paint_product_id ?? defaultPaintProductId)
        );
        return s + l.litres * (product?.cost_per_litre ?? 0);
      }, 0),
    0
  );
  // A hand-priced Wash counts as labour: its hours are already in Total Hours,
  // but its cost is its own unit price × hours (not the labour cost rate).
  const pricedWashLines = coreBuildings.flatMap((b) => b.lines).filter(isPricedWash);
  const pricedWashHours = pricedWashLines.reduce((s, l) => s + l.qty, 0);
  const pricedWashCost = pricedWashLines.reduce((s, l) => s + l.qty * (l.unit_price ?? 0), 0);
  const costShares = {
    labour: (allAreas.totalHours - pricedWashHours) * labourCostRate + pricedWashCost,
    material: materialCost,
    access: coreItems.filter((i) => i.is_access).reduce((s, i) => s + itemCost(i), 0),
    // Other items, plus night shift (which is a non-labour-rate extra).
    other:
      coreItems.filter((i) => !i.is_access).reduce((s, i) => s + itemCost(i), 0) +
      coreBuildings.reduce((s, b) => s + nightShiftFor(b).cost, 0) / (1 + markupOtherPct),
  };
  const totalCostBase =
    costShares.labour + costShares.material + costShares.access + costShares.other;
  // Job profit margin — the reference spreadsheet's (sell − cost) ÷ sell
  // (Take Off J17), worked out the same way as the GP % on the Summary page:
  // allowances are added to both sides, since they carry no mark-up.
  const allowances = (quote.allowance_site ?? 0) + (quote.allowance_other ?? 0);
  const sellForMargin = subtotal + allowances;
  const profitMargin =
    sellForMargin > 0
      ? `${(((sellForMargin - (totalCostBase + allowances)) / sellForMargin) * 100).toFixed(1)}%`
      : "0%";

  const sharePct = (cost: number) =>
    cost > 0 && totalCostBase > 0 ? `${((cost / totalCostBase) * 100).toFixed(1)}%` : "0%";

  const headerStats: {
    label: string;
    value: string;
    cost?: string;
    pct?: string;
    // A short box that keeps to its contents, leaving the rest for the others.
    compact?: boolean;
    detailTitle?: string;
  }[] = [
    {
      label: "Total Hours",
      // Every area's hours, plus the hours on any Exterior Wash lines.
      value: String(Math.ceil(allAreas.totalHours + washItemHours(coreItems))),
      cost: fmtCurrencyWhole(costShares.labour),
      pct: sharePct(costShares.labour),
      detailTitle: "Labour cost, and its share of total cost",
    },
    {
      label: "Litres",
      value: String(Math.ceil(allAreas.litres)),
      cost: fmtCurrencyWhole(costShares.material),
      pct: sharePct(costShares.material),
      detailTitle: "Material cost, and its share of total cost",
    },
    {
      label: "Access",
      value: fmtCurrency(accessTotal),
      pct: sharePct(costShares.access),
      detailTitle: "Access share of total cost",
    },
    {
      label: "Profit margin",
      value: profitMargin,
      compact: true,
      detailTitle: "(Sell − cost) ÷ sell, before Negotiating Factor and GST",
    },
    // Every area plus all Access and Other items — before discount and GST.
    { label: "Amount", value: fmtCurrency(Math.ceil(subtotal)) },
  ];

  return (
    <div className="w-full" data-no-spinner>
      <datalist id="line-item-names">
        {lineItemNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-ink">Edit costing</h1>
          <QuoteStatusChip status={status} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Same save as the button at the bottom, so a long costing can be
              saved without scrolling; its result shows here too. */}
          {error && <p className="text-xs text-brand-red">{error}</p>}
          {!error && savedAt && <p className="text-xs text-muted">Saved.</p>}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save costing"}
          </button>
          {/* Leave without saving: drops any unsaved changes and goes back to
              the Costings list. */}
          <button
            onClick={() => {
              setDirty(false);
              router.push("/costing");
            }}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-background"
          >
            <X className="h-3.5 w-3.5" />
            Don&apos;t save
          </button>
          {/* Only offered on a saved, untouched Complete costing — the copy is
              made from what's saved. */}
          {locked && !dirty && (
            <button
              onClick={openCopy}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-background"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy costing
            </button>
          )}
          {DELETABLE_STATUSES.includes(status) && (
            <button
              onClick={deleteQuote}
              disabled={deletingQuote}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-brand-red-dark transition hover:bg-background disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deletingQuote ? "Deleting…" : "Delete costing"}
            </button>
          )}
        </div>
      </div>

      {locked && (
        <p className="mb-4 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm text-purple-800">
          This costing is Complete, so it&apos;s locked. Change its Status to edit it, or use
          Copy costing to start a new version.
        </p>
      )}

      {copyOpen && (
        <Modal
          title="Copy costing"
          onClose={() => !copying && setCopyOpen(false)}
          onSave={createCopy}
          saving={copying}
          saveLabel="Create copy"
        >
          <p className="text-sm text-muted">
            This makes a new Draft costing with everything in this one — its areas, lines and
            items. Give it a name:
          </p>
          <Field label="Costing name" required>
            <input
              autoFocus
              className={inputClass}
              value={copyName}
              onChange={(e) => setCopyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createCopy()}
            />
          </Field>
          {copyError && <p className="text-sm text-brand-red">{copyError}</p>}
        </Modal>
      )}

      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* display:contents fieldsets: they lock their fields when the
              costing is Complete without changing the grid layout. */}
          <fieldset disabled={locked} className="contents">
            <Field label="Customer" required>
              <CustomerSelect
                customers={customerList}
                value={customerId}
                onChange={setCustomerId}
                onCreated={(c) => setCustomerList((prev) => [c, ...prev])}
              />
            </Field>

            <Field label="Job location">
              <input
                className={inputClass}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </Field>

            <Field label="Project">
              <input
                className={inputClass}
                value={project}
                onChange={(e) => setProject(e.target.value)}
              />
            </Field>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Stored in the valid_until column; only the label changed. */}
            <fieldset disabled={locked} className="contents">
              <Field label="Created">
                <input
                  type="date"
                  className={inputClass}
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </Field>
            </fieldset>

            <Field label="Status">
              <select
                className={inputClass}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {/* A costing already saved as Declined/Expired keeps showing it. */}
                {(STATUSES.includes(status) ? STATUSES : [...STATUSES, status]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s] ?? s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <fieldset disabled={locked} className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Labour sell rate ($/hr)">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={labourSellOverride}
              placeholder={`${companyLabourRateSell} (company rate)`}
              onChange={(e) => setLabourSellOverride(e.target.value)}
            />
          </Field>

          <Field label="Labour cost rate ($/hr)">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={labourCostOverride}
              placeholder={`${companyLabourRateCost} (company rate)`}
              onChange={(e) => setLabourCostOverride(e.target.value)}
            />
          </Field>

          <Field label="Negotiating Factor (%)">
            <input
              type="number"
              step="0.1"
              className={inputClass}
              value={negotiatingFactorInput}
              onChange={(e) => setNegotiatingFactorInput(e.target.value)}
            />
          </Field>
        </fieldset>

        {/* One row at every screen width: each box is as wide as its
            contents need and they share out the rest; a very narrow screen
            scrolls sideways rather than wrapping. */}
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {headerStats.map((s) => (
            <div
              key={s.label}
              className={s.compact ? "min-w-fit flex-none" : "min-w-fit flex-1"}
            >
              <Field label={s.label}>
                {/* Everything on one line, centred in the box. */}
                <div
                  title={s.detailTitle}
                  className="flex items-baseline justify-center gap-x-2.5 whitespace-nowrap rounded-lg border border-border bg-background px-3 py-2 text-base font-semibold text-ink sm:text-sm"
                >
                  <span>{s.value}</span>
                  {s.cost && <span className="text-xs font-medium text-muted">{s.cost}</span>}
                  {s.pct && <span className="text-xs font-medium text-muted">{s.pct}</span>}
                </div>
              </Field>
            </div>
          ))}
        </div>
      </div>

      <fieldset disabled={locked} className="mt-6 min-w-0">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Buildings / Areas</h2>
          <AddBuildingButtons buildings={buildings} onAdd={addBuilding} onCopy={copyBuilding} />
        </div>

        {movableWash.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <span>
              {movableWash.length} area{movableWash.length === 1 ? " has" : "s have"} a Wash
              under Other items. Move it into the area&apos;s Wash so its hours and $ count in the
              area and the totals.
              {strandedWashCount > 0 &&
                ` (${strandedWashCount} wash line${strandedWashCount === 1 ? "" : "s"} elsewhere can't be moved automatically.)`}
            </span>
            <button onClick={moveWashItemsIntoAreas} className={addButtonClass}>
              Move into each area&apos;s Wash
            </button>
          </div>
        )}

        {buildings.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted shadow-sm">
            No buildings yet.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {buildings.map((building) => {
              // Wash/Sundry aren't area — their Qty is hours, not m² — so
              // they're excluded from the building's total (and the $/m²
              // that's derived from it).
              const buildingUnits = building.lines
                .filter((l) => l.line_type === "surface")
                .reduce((s, l) => s + l.girth * l.qty, 0);
              const buildingLitres = building.lines.reduce((s, l) => s + l.litres, 0);
              const buildingPrepHours = building.lines.reduce((s, l) => s + l.prep_hours, 0);
              // Surface/wash/sundry hours + prep hours combined (the
              // spreadsheet's "Hours" figure), then Total Hours on top of
              // that adds Sheeting Up's own hours.
              const buildingHours = hoursFor(building);
              const sheetingUp = sheetingUpFor(building);
              const totalHours = totalHoursFor(building);
              const nightShift = nightShiftFor(building);
              const buildingCost =
                building.lines.reduce((s, l) => s + l.cost, 0) +
                prepCostFor(building) +
                sheetingUp.cost +
                nightShift.cost;
              // This building's own share of the Negotiating Factor, at the
              // same rate applied to the quote as a whole.
              const buildingNegotiatingFactor =
                Math.round(buildingCost * negotiatingFactorPctNum * 100) / 100;

              return (
                <div
                  key={building.id}
                  className={
                    "rounded-xl border bg-surface shadow-sm " +
                    (building.is_option ? "border-dashed border-amber-500" : "border-border")
                  }
                >
                  {building.is_option && (
                    <p className="rounded-t-xl bg-amber-50 px-4 py-1.5 text-xs font-semibold text-amber-800">
                      Option — priced on its own, not included in the total
                      {building.option_group?.trim() ? ` · group "${building.option_group.trim()}"` : ""}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
                    <input
                      className={inputClass + " min-w-40 flex-1 font-semibold"}
                      value={building.name}
                      onChange={(e) => updateBuilding(building.id, { name: e.target.value })}
                      placeholder="Building / Area name"
                    />
                    <select
                      className={inputClass + " w-28"}
                      value={building.category}
                      onChange={(e) => setBuildingCategory(building.id, e.target.value)}
                    >
                      <option value="Internal">Interior</option>
                      <option value="External">Exterior</option>
                    </select>
                    <OptionControls
                      isOption={!!building.is_option}
                      group={building.option_group ?? ""}
                      onChange={(patch) => updateBuilding(building.id, patch)}
                    />
                    <button
                      onClick={() => removeBuilding(building.id)}
                      aria-label="Remove building"
                      className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-brand-red"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* The lines scroll inside the box with the Surface / Girth /
                      Qty... headings pinned at the top, so they stay in view
                      however far down a long area you go. */}
                  <div className="max-h-[75vh] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-30 bg-surface shadow-[0_1px_0_0_var(--color-border,#e5e7eb)]">
                        <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                          <th className="px-2 py-2">Surface</th>
                          <th className="px-2 py-2">Girth</th>
                          <th className="px-2 py-2">Qty</th>
                          <th className="px-2 py-2">Coats</th>
                          <th className="px-2 py-2">Labour Rate</th>
                          <th className="px-2 py-2">Spread Rate</th>
                          <th className="px-2 py-2">Material Rate</th>
                          <th className="px-2 py-2">Hours</th>
                          <th className="px-2 py-2">Litres</th>
                          <th className="px-2 py-2">Cost</th>
                          <th className="px-2 py-2">Calc. Rate</th>
                          <th className="px-2 py-2">Prep Rate</th>
                          <th className="px-2 py-2">Prep</th>
                          <th className="px-2 py-2">Paint</th>
                          <th className="px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {/* The Wash row isn't listed — it's set by the Wash tick box
                            below. Surfaces first, then any hourly items. */}
                        {building.lines
                          .filter((l) => l.line_type === "surface" || l.line_type === "hourly")
                          .map((line) => (
                          <tr key={line.id} className="border-b border-border last:border-b-0">
                            <td className="px-2 py-1.5">
                              <input
                                className={inputClass + " line-input"}
                                value={line.surface_name}
                                onChange={(e) =>
                                  updateLine(building.id, line.id, { surface_name: e.target.value })
                                }
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              {line.line_type === "surface" ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  className={inputClass + " line-input"}
                                  value={line.girth === 0 ? "" : line.girth}
                                  onChange={(e) =>
                                    updateLine(building.id, line.id, {
                                      girth: Number(e.target.value) || 0,
                                    })
                                  }
                                />
                              ) : null}
                            </td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  className={inputClass + " line-input"}
                                  value={line.qty === 0 ? "" : line.qty}
                                  onChange={(e) =>
                                    updateLine(building.id, line.id, {
                                      qty: Number(e.target.value) || 0,
                                    })
                                  }
                                />
                                {line.line_type !== "surface" && (
                                  <span className="text-[10px] text-muted">Qty in Hrs</span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-1.5">
                              {line.line_type === "surface" ? (
                                <input
                                  type="number"
                                  className={
                                    inputClass +
                                    " line-input" +
                                    changedClass(line.coats, line.default_coats)
                                  }
                                  value={line.coats === 0 ? "" : line.coats}
                                  onChange={(e) =>
                                    updateLine(building.id, line.id, {
                                      coats: Number(e.target.value) || 0,
                                    })
                                  }
                                />
                              ) : null}
                            </td>
                            <td className="px-2 py-1.5">
                              {line.line_type === "surface" ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  className={
                                    inputClass +
                                    " line-input" +
                                    changedClass(line.labour_rate, line.default_labour_rate)
                                  }
                                  value={line.labour_rate === 0 ? "" : line.labour_rate}
                                  onChange={(e) =>
                                    updateLine(building.id, line.id, {
                                      labour_rate: Number(e.target.value) || 0,
                                    })
                                  }
                                />
                              ) : null}
                            </td>
                            <td className="px-2 py-1.5">
                              {line.line_type === "surface" ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  className={
                                    inputClass +
                                    " line-input" +
                                    changedClass(line.spread_rate, line.default_spread_rate)
                                  }
                                  value={line.spread_rate === 0 ? "" : line.spread_rate}
                                  onChange={(e) =>
                                    updateLine(building.id, line.id, {
                                      spread_rate: Number(e.target.value) || 0,
                                    })
                                  }
                                />
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                              {line.line_type === "surface" ? fmtCurrency(line.material_rate) : null}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                              {line.hours.toFixed(2)}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                              {line.litres.toFixed(2)}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5 font-medium">
                              {fmtCurrency(line.cost)}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                              {fmtCurrency(line.calc_rate)}
                            </td>
                            <td className="px-2 py-1.5">
                              {line.line_type === "surface" ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  className={
                                    inputClass +
                                    " line-input" +
                                    changedClass(line.prep_rate, line.default_prep_rate)
                                  }
                                  value={line.prep_rate === 0 ? "" : line.prep_rate}
                                  onChange={(e) =>
                                    updateLine(building.id, line.id, {
                                      prep_rate: Number(e.target.value) || 0,
                                    })
                                  }
                                />
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-muted">
                              {line.line_type === "surface" ? line.prep_hours.toFixed(2) : null}
                            </td>
                            <td className="px-2 py-1.5">
                              {line.line_type === "surface" ? (
                                <SearchableSelect
                                  className="w-32"
                                  placeholder="Company default"
                                  emptyLabel="Use default"
                                  value={line.paint_product_id}
                                  onChange={(id) => {
                                    // The paint's own spread rate (Paint Products page) comes
                                    // with it - its price follows automatically (material rate).
                                    // Back to the company spread rate for "Use default".
                                    const product = paintProducts.find((p) => p.id === id);
                                    const spread = product?.coverage_sqm_per_litre || spreadRateSqmPerLitre;
                                    updateLine(building.id, line.id, {
                                      paint_product_id: id,
                                      spread_rate: spread,
                                      default_spread_rate: spread,
                                    });
                                  }}
                                  options={paintOptions}
                                />
                              ) : null}
                            </td>
                            <td className="px-2 py-1.5">
                              <button
                                onClick={() => removeLine(building.id, line.id)}
                                aria-label="Remove line"
                                className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-brand-red"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-56">
                        <SearchableSelect
                          className="text-xs"
                          placeholder="Add new surface"
                          emptyLabel="Cancel"
                          value={null}
                          onChange={(id) => id && addSurfaceLine(building.id, id)}
                          secondaryOption={{ label: "Custom", onSelect: () => addLine(building.id) }}
                          options={surfaceTypes
                            .filter((s) => s.category === building.category)
                            .map((s) => ({
                              id: s.id,
                              label: s.name,
                              sublabel: `${s.labour_productivity_sqm_per_hr} ${s.unit}`,
                            }))}
                        />
                      </div>
                      <button onClick={() => addHourlyLine(building.id)} className={addButtonClass}>
                        <Plus className="h-3.5 w-3.5" />
                        Add hourly item
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
                    <label className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={building.sheeting_up_enabled}
                        onChange={(e) =>
                          updateBuilding(building.id, { sheeting_up_enabled: e.target.checked })
                        }
                      />
                      Sheeting up
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.1"
                        disabled={!building.sheeting_up_enabled}
                        className={inputClass + " w-20 disabled:opacity-50"}
                        value={
                          building.sheeting_up_pct === 0
                            ? ""
                            : Math.round(building.sheeting_up_pct * 1000) / 10
                        }
                        onChange={(e) =>
                          updateBuilding(building.id, {
                            sheeting_up_pct: (Number(e.target.value) || 0) / 100,
                          })
                        }
                      />
                      <span className="text-sm text-muted">% of hours</span>
                    </div>
                    <span className="text-xs text-muted">
                      = {sheetingUp.hours.toFixed(2)} hrs · {fmtCurrency(sheetingUp.cost)}
                    </span>
                  </div>

                  {building.category === "External" &&
                    (() => {
                      // Ticked: the hours are worked out from the exterior m².
                      // Unticked: an editable box for the hours instead — it's
                      // the Wash row's Qty, so the row above stays in step.
                      const washLine = building.lines.find((l) => l.line_type === "wash");
                      return (
                        <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
                          <label className="flex items-center gap-2 text-sm text-ink">
                            <input
                              type="checkbox"
                              checked={building.auto_wash_enabled}
                              onChange={(e) => setAutoWash(building.id, e.target.checked)}
                            />
                            Wash
                          </label>
                          {washLine &&
                            (building.auto_wash_enabled ? (
                              // Ticked: the same hours box, filled in for you.
                              <div className="flex flex-wrap items-center gap-2">
                                <div title="Calculated from the exterior m² — untick to enter it yourself">
                                  <input
                                    readOnly
                                    tabIndex={-1}
                                    aria-label="Wash hours (calculated)"
                                    className={inputClass + " w-24" + READ_ONLY_CLASS}
                                    value={washLine.qty}
                                  />
                                </div>
                                <span className="text-xs text-muted">
                                  hrs, calculated from the exterior m² (75m² per hour). Untick to
                                  enter the hours yourself.
                                </span>
                              </div>
                            ) : (
                              // Hand-entered: hours × unit price + mark-up, the same
                              // boxes a Wash under Other items had.
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  aria-label="Wash hours"
                                  className={inputClass + " w-24"}
                                  placeholder="0"
                                  value={washLine.qty === 0 ? "" : washLine.qty}
                                  onChange={(e) =>
                                    updateLine(building.id, washLine.id, {
                                      qty: Number(e.target.value) || 0,
                                    })
                                  }
                                />
                                <span className="text-sm text-muted">hrs ×</span>
                                <span className="text-sm text-muted">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  aria-label="Wash unit price per hour"
                                  className={inputClass + " w-24"}
                                  placeholder="Unit price"
                                  value={washLine.unit_price ?? ""}
                                  onChange={(e) =>
                                    updateLine(building.id, washLine.id, {
                                      unit_price:
                                        e.target.value === "" ? null : Number(e.target.value) || 0,
                                    })
                                  }
                                />
                                <span className="text-sm text-muted">/hr, mark-up</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  aria-label="Wash mark-up percent"
                                  className={inputClass + " w-16"}
                                  value={
                                    washLine.markup_pct == null
                                      ? ""
                                      : Math.round(washLine.markup_pct * 1000) / 10
                                  }
                                  onChange={(e) =>
                                    updateLine(building.id, washLine.id, {
                                      markup_pct: (Number(e.target.value) || 0) / 100,
                                    })
                                  }
                                />
                                <span className="text-sm text-muted">%</span>
                                <span className="text-sm font-medium text-ink">
                                  = {fmtCurrency(washLine.cost)}
                                </span>
                              </div>
                            ))}
                        </div>
                      );
                    })()}

                  <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
                    {/* Night shift and Out of hours are one or the other: once
                        either is ticked, the other tick box goes away. */}
                    {!building.out_of_hours_enabled && (
                      <label className="flex items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={building.night_shift_enabled}
                          onChange={(e) =>
                            updateBuilding(building.id, { night_shift_enabled: e.target.checked })
                          }
                        />
                        Night shift
                      </label>
                    )}
                    {!building.night_shift_enabled && (
                      <label className="flex items-center gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={building.out_of_hours_enabled}
                          onChange={(e) =>
                            updateBuilding(building.id, { out_of_hours_enabled: e.target.checked })
                          }
                        />
                        Out of hours
                      </label>
                    )}
                    {building.out_of_hours_enabled && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-muted">$</span>
                          <input
                            type="number"
                            step="0.01"
                            aria-label="Out of hours rate per hour"
                            className={inputClass + " w-24"}
                            value={building.out_of_hours_rate === 0 ? "" : building.out_of_hours_rate}
                            onChange={(e) =>
                              updateBuilding(building.id, {
                                out_of_hours_rate: Number(e.target.value) || 0,
                              })
                            }
                          />
                          <span className="text-sm text-muted">/hr</span>
                        </div>
                        <span className="text-xs text-muted">
                          Qty {nightShift.hours.toFixed(2)} hrs (building total) ·{" "}
                          {fmtCurrency(nightShift.cost)}
                        </span>
                      </>
                    )}
                    {building.night_shift_enabled && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-muted">$</span>
                          <input
                            type="number"
                            step="0.01"
                            className={inputClass + " w-24"}
                            value={building.night_shift_rate === 0 ? "" : building.night_shift_rate}
                            onChange={(e) =>
                              updateBuilding(building.id, {
                                night_shift_rate: Number(e.target.value) || 0,
                              })
                            }
                          />
                          <span className="text-sm text-muted">/hr</span>
                        </div>
                        <span className="text-xs text-muted">
                          Qty {nightShift.hours.toFixed(2)} hrs (building total) ·{" "}
                          {fmtCurrency(nightShift.cost)}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border p-4 text-xs text-muted">
                    <span>
                      Total m²{" "}
                      <span className="font-semibold text-ink">{Math.ceil(buildingUnits)}</span>
                    </span>
                    {buildingUnits > 0 && (
                      <span>
                        Cost/m²{" "}
                        <span className="font-semibold text-ink">
                          {fmtCurrency(Math.ceil(buildingCost / buildingUnits))}
                        </span>
                      </span>
                    )}
                    <span>
                      Hours <span className="font-semibold text-ink">{Math.ceil(buildingHours)}</span>
                    </span>
                    <span>
                      Total Hours{" "}
                      <span className="font-semibold text-ink">
                        {Math.ceil(
                          totalHours +
                            washItemHours(lineItems.filter((i) => i.building_id === building.id))
                        )}
                      </span>
                    </span>
                    <span>
                      Litres{" "}
                      <span className="font-semibold text-ink">{Math.ceil(buildingLitres)}</span>
                    </span>
                    <span>
                      Amount{" "}
                      <span className="font-semibold text-ink">
                        {fmtCurrency(Math.ceil(buildingCost))}
                      </span>
                    </span>
                    <span>
                      Prep Hrs{" "}
                      <span className="font-semibold text-ink">
                        {Math.ceil(buildingPrepHours)}
                      </span>
                    </span>
                    <span>
                      Negotiating Factor{" "}
                      <span className="font-semibold text-ink">
                        {fmtCurrency(buildingNegotiatingFactor)}
                      </span>
                    </span>
                    <span>
                      Amount after NF{" "}
                      <span className="font-semibold text-ink">
                        {fmtCurrency(Math.ceil(buildingCost + buildingNegotiatingFactor))}
                      </span>
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 border-t border-border p-4 sm:grid-cols-2">
                    <Field label="Excludes">
                      <input
                        className={inputClass}
                        value={building.excludes}
                        onChange={(e) => updateBuilding(building.id, { excludes: e.target.value })}
                      />
                    </Field>
                    <Field label="Note">
                      <input
                        className={inputClass}
                        value={building.note}
                        onChange={(e) => updateBuilding(building.id, { note: e.target.value })}
                      />
                    </Field>
                  </div>

                  <div className="border-t border-border p-4">
                    <OtherItemsSection
                      kind="access"
                      buildingId={building.id}
                      heading="Access items"
                      items={lineItems.filter(
                        (i) => i.building_id === building.id && i.is_access
                      )}
                      accessRates={accessRates}
                      accessSellOf={accessSellOf}
                      onAddMobileScaffold={addMobileScaffoldLine}
                      onAddEwp={addEwpLine}
                      onAddScaffoldByM2={addScaffoldByM2}
                      onAddLineItem={addLineItem}
                      onUpdateLineItem={updateLineItem}
                      onRemoveLineItem={removeLineItem}
                      qtyUnitSuffix={qtyUnitSuffix}
                    />
                  </div>

                  <div className="border-t border-border p-4">
                    <OtherItemsSection
                      kind="other"
                      buildingId={building.id}
                      heading="Other items"
                      items={lineItems
                        .filter((i) => i.building_id === building.id && !i.is_access)
                        .sort(
                          (a, b) =>
                            Number(b.description === "Exterior Wash") -
                            Number(a.description === "Exterior Wash")
                        )}
                      accessRates={accessRates}
                      accessSellOf={accessSellOf}
                      onAddMobileScaffold={addMobileScaffoldLine}
                      onAddEwp={addEwpLine}
                      onAddScaffoldByM2={addScaffoldByM2}
                      onAddLineItem={addLineItem}
                      onUpdateLineItem={updateLineItem}
                      onRemoveLineItem={removeLineItem}
                      qtyUnitSuffix={qtyUnitSuffix}
                    />
                  </div>

                  <div className="border-t border-border p-4">
                    <AddBuildingButtons
                      buildings={buildings}
                      onAdd={addBuilding}
                      onCopy={copyBuilding}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </fieldset>

      <div className="mt-6 flex justify-end">
        <div className="w-full max-w-xs rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Subtotal</span>
            <span className="font-medium">{fmtCurrency(subtotal)}</span>
          </div>
          <div className="mt-1.5 flex justify-between text-sm">
            <span className="text-muted">Negotiating Factor ({Math.round(negotiatingFactorPctNum * 10000) / 100}%)</span>
            <span className="font-medium">{fmtCurrency(negotiatingFactorAmount)}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-base">
            <span className="font-semibold text-ink">Total</span>
            <span className="font-semibold text-ink">{fmtCurrency(subtotal + negotiatingFactorAmount)}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted">GST ({taxRateNum}%)</span>
            <span className="font-medium">
              {fmtCurrency((subtotal + negotiatingFactorAmount) * (taxRateNum / 100))}
            </span>
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-base">
            <span className="font-semibold text-ink">Total</span>
            <span className="font-semibold text-ink">{fmtCurrency(total)}</span>
          </div>
        </div>
      </div>

      {optionRows.length > 0 && (
        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-md rounded-xl border border-dashed border-amber-500 bg-surface p-5 shadow-sm">
            <p className="text-sm font-semibold text-ink">Options</p>
            <p className="mb-2 text-xs text-muted">Priced separately, not included in the total (excl. GST).</p>
            {optionGroups.map(([group, rows]) => (
              <div key={group || "standalone"} className="mt-2">
                {group && (
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{group} · pick one</p>
                )}
                {rows.map((r) => (
                  <div key={r.key} className="mt-1 flex justify-between gap-3 text-sm">
                    <span>{r.name}</span>
                    <span className="font-medium">{fmtCurrency(r.price)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-end gap-3">
        {error && <p className="text-sm text-brand-red">{error}</p>}
        {!error && savedAt && <p className="text-sm text-muted">Saved.</p>}
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save costing"}
        </button>
      </div>
    </div>
  );
}

// "Option" tick box, and when ticked a group name for alternatives (the
// customer picks one option per group). Used on areas and on items.
function OptionControls({
  isOption,
  group,
  onChange,
  compact = false,
}: {
  isOption: boolean;
  group: string;
  onChange: (patch: { is_option?: boolean; option_group?: string | null }) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-ink" title="Priced on its own and not included in the total">
        <input
          type="checkbox"
          checked={isOption}
          onChange={(e) => onChange({ is_option: e.target.checked })}
        />
        {compact ? "" : "Option"}
      </label>
      {isOption && (
        <input
          className={inputClass + (compact ? " w-24" : " w-32")}
          value={group}
          onChange={(e) => onChange({ option_group: e.target.value })}
          placeholder="Group (optional)"
          title="Options with the same group are alternatives - the customer picks one"
        />
      )}
    </div>
  );
}
