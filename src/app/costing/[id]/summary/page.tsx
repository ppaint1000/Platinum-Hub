import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuoteStatusChip } from "@/components/quotes/StatusChip";
import { AllowancesEditor } from "@/components/quotes/AllowancesEditor";
import { SchedulingEditor } from "@/components/quotes/SchedulingEditor";
import { AreaSummaryTable, type AreaRow } from "@/components/quotes/AreaSummaryTable";
import { washItemHours } from "@/lib/quotes/washItems";
import { fmtCurrency } from "@/lib/quotes/format";

type RawLine = {
  line_type?: string | null;
  qty: number;
  hours: number;
  litres: number;
  prep_hours: number;
  cost: number;
  paint_product_id: string | null;
  // A hand-entered Wash line has these (priced like an item, not at labour).
  unit_price?: number | null;
  markup_pct?: number | null;
};
type RawBuilding = {
  id: string;
  name: string | null;
  category: string | null;
  sheeting_up_enabled: boolean;
  sheeting_up_pct: number;
  night_shift_enabled: boolean | null;
  night_shift_rate: number | null;
  out_of_hours_enabled?: boolean | null;
  out_of_hours_rate?: number | null;
  // Ticked on the Area table; absent until migration 027 has been run.
  summary_selected?: boolean | null;
  // An option area (migration 031): priced on its own, not in the totals.
  is_option?: boolean | null;
  option_group?: string | null;
  quote_building_lines: RawLine[] | null;
};
type RawLineItem = {
  id: string;
  building_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  markup_pct: number | null;
  line_total: number;
  scaffold_role: "edt" | "hire" | null;
  is_option?: boolean | null;
  option_group?: string | null;
};
type PaintProduct = {
  id: string;
  name: string;
  brand: string | null;
  cost_per_litre: number;
  is_default: boolean;
};

export default async function QuoteSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: quote }, { data: buildings }, { data: lineItems }, { data: settings }, { data: paintProducts }] =
    await Promise.all([
      supabase.from("quotes").select("*, customers:clients(name)").eq("id", id).single(),
      supabase
        .from("quote_buildings")
        .select("*, quote_building_lines(*)")
        .eq("quote_id", id)
        .order("sort_order"),
      supabase.from("quote_line_items").select("*").eq("quote_id", id).order("sort_order"),
      supabase
        .from("costing_settings")
        .select("labour_rate_sell, labour_rate_cost, gst_pct, markup_material_pct, markup_other_pct, paint_flat_addition")
        .limit(1)
        .maybeSingle(),
      supabase.from("paint_products").select("id, name, brand, cost_per_litre, is_default"),
    ]);

  if (!quote) notFound();

  const labourRateSell = quote.labour_sell_override ?? settings?.labour_rate_sell ?? 55;
  const labourRateCost = quote.labour_cost_override ?? settings?.labour_rate_cost ?? 30;
  const markupMaterialPct = settings?.markup_material_pct ?? 0.2;
  const markupOtherPct = settings?.markup_other_pct ?? 0.2;
  const paintFlatAddition = settings?.paint_flat_addition ?? 1.6;
  const customerName = (quote.customers as unknown as { name: string } | null)?.name ?? "—";

  const products = (paintProducts ?? []) as PaintProduct[];
  const defaultPaintId = products.find((p) => p.is_default)?.id ?? null;
  function paintSellRate(p: PaintProduct) {
    return p.cost_per_litre * (1 + markupMaterialPct) + paintFlatAddition;
  }

  // Per-building math mirrors QuoteEditor.tsx's hoursFor/sheetingUpFor/
  // totalHoursFor/nightShiftFor/prepCostFor exactly (this page can't import
  // those client-side functions directly, but the formulas are the same
  // ones already verified against the reference spreadsheet).
  // Options (an area or item ticked "Option" on the costing) are listed on
  // their own and left out of every total below.
  const allBuildings = (buildings ?? []) as RawBuilding[];
  const optionAreaIds = new Set(allBuildings.filter((b) => b.is_option).map((b) => b.id));
  const coreBuildingRows = allBuildings.filter((b) => !b.is_option);
  const allItems = (lineItems ?? []) as RawLineItem[];
  const isOptionItem = (i: RawLineItem) =>
    !!i.is_option || (i.building_id !== null && optionAreaIds.has(i.building_id));

  const allSummaries = allBuildings.map((b) => {
    const lines = b.quote_building_lines ?? [];
    const rawHours = lines.reduce((s, l) => s + l.hours, 0);
    const prepHours = lines.reduce((s, l) => s + l.prep_hours, 0);
    const litres = lines.reduce((s, l) => s + l.litres, 0);
    const linesCost = lines.reduce((s, l) => s + l.cost, 0);
    const prepCost = prepHours * labourRateSell;
    // A hand-entered Wash is priced as an item (hours × unit price × (1 +
    // mark-up)): its hours count in the totals but not for Sheeting Up, and
    // it gets its own row below rather than being folded into Labour.
    const pricedWash = lines.filter((l) => l.line_type === "wash" && l.unit_price != null);
    const washHours = pricedWash.reduce((s, l) => s + l.hours, 0);
    const washSell = pricedWash.reduce((s, l) => s + l.cost, 0);
    const washRawCost = pricedWash.reduce((s, l) => s + l.qty * (l.unit_price ?? 0), 0);
    // Hourly items (hours × labour sell rate) aren't uplifted either.
    const hourlyHours = lines
      .filter((l) => l.line_type === "hourly")
      .reduce((s, l) => s + l.hours, 0);
    const sheetingUpHours = b.sheeting_up_enabled
      ? b.sheeting_up_pct * (rawHours - washHours - hourlyHours)
      : 0;
    const sheetingUpCost = sheetingUpHours * labourRateSell;
    const totalHours = rawHours + prepHours + sheetingUpHours;
    // Night shift / Out of hours: same formula, own rate, one or the other.
    const nightOn = !!b.night_shift_enabled;
    const oohOn = !nightOn && !!b.out_of_hours_enabled;
    const shiftHours = nightOn || oohOn ? totalHours : 0;
    const shiftRate = nightOn ? (b.night_shift_rate ?? 0) : oohOn ? (b.out_of_hours_rate ?? 0) : 0;
    const shiftSell = shiftHours * shiftRate * (1 + markupOtherPct);
    const price = linesCost + prepCost + sheetingUpCost + shiftSell;

    return {
      id: b.id,
      name: b.name || "Untitled area",
      category: b.category === "External" ? "Exterior" : "Interior",
      hours: totalHours,
      litres,
      price,
      washHours,
      washSell,
      washRawCost,
      nightShiftHours: nightOn ? shiftHours : 0,
      nightShiftCost: nightOn ? shiftSell : 0,
      nightShiftRawCost: nightOn ? shiftHours * shiftRate : 0,
      oohHours: oohOn ? shiftHours : 0,
      oohSell: oohOn ? shiftSell : 0,
      oohRawCost: oohOn ? shiftHours * shiftRate : 0,
      selected: !!b.summary_selected,
      isOption: !!b.is_option,
      optionGroup: b.option_group?.trim() ?? "",
    };
  });
  const buildingSummaries = allSummaries.filter((b) => !b.isOption);

  const buildingsSubtotal = buildingSummaries.reduce((s, b) => s + b.price, 0);
  const totalQuoteHours = buildingSummaries.reduce((s, b) => s + b.hours, 0);

  // A hand-priced Wash is its own row, so its hours come out of Labour's.
  const washHoursTotal = buildingSummaries.reduce((s, b) => s + b.washHours, 0);
  const washSellTotal = buildingSummaries.reduce((s, b) => s + b.washSell, 0);
  const washCostTotal = buildingSummaries.reduce((s, b) => s + b.washRawCost, 0);

  // Labour — one row (overtime is no longer used).
  const labourHours = totalQuoteHours - washHoursTotal;
  const labourSell = labourHours * labourRateSell;
  const labourCost = labourHours * labourRateCost;

  // Paint — broken out by the paint product actually used, not the
  // spreadsheet's old fixed 3-tier system (the app's paint catalog is
  // flexible, so this reports the same total dollars against real products).
  const litresByProduct = new Map<string, number>();
  for (const b of coreBuildingRows) {
    for (const line of b.quote_building_lines ?? []) {
      const productId = line.paint_product_id ?? defaultPaintId;
      if (!productId || line.litres <= 0) continue;
      litresByProduct.set(productId, (litresByProduct.get(productId) ?? 0) + line.litres);
    }
  }
  const paintRows = Array.from(litresByProduct.entries())
    .map(([productId, litres]) => {
      const product = products.find((p) => p.id === productId);
      const sellRate = product ? paintSellRate(product) : 0;
      const costRate = product?.cost_per_litre ?? 0;
      return {
        id: productId,
        label: product ? `${product.name}${product.brand ? ` (${product.brand})` : ""}` : "Unspecified paint",
        litres,
        sellRate,
        sellValue: litres * sellRate,
        costRate,
        costValue: litres * costRate,
      };
    })
    .sort((a, b) => b.sellValue - a.sellValue);
  const paintSell = paintRows.reduce((s, r) => s + r.sellValue, 0);
  const paintCost = paintRows.reduce((s, r) => s + r.costValue, 0);

  // Night shift — its own small category so the categories add up exactly
  // to the Area table's totals (night shift isn't priced at the labour
  // rate, so it can't fold into the Labour row).
  const nightShiftSell = buildingSummaries.reduce((s, b) => s + b.nightShiftCost, 0);
  const nightShiftCostTotal = buildingSummaries.reduce((s, b) => s + b.nightShiftRawCost, 0);
  const nightShiftHoursTotal = buildingSummaries.reduce((s, b) => s + b.nightShiftHours, 0);
  const oohSellTotal = buildingSummaries.reduce((s, b) => s + b.oohSell, 0);
  const oohCostTotal = buildingSummaries.reduce((s, b) => s + b.oohRawCost, 0);
  const oohHoursTotal = buildingSummaries.reduce((s, b) => s + b.oohHours, 0);

  // Access & Other items — grouped by description (Scaffold/EWP/Exterior
  // Wash/free-form), no equivalent of the spreadsheet's fixed name-matching
  // categories exists in this app's data model, so this reports against
  // the real line items instead.
  const items = allItems.filter((i) => !isOptionItem(i));

  // Each option with its own price (an option area includes its own items).
  const optionRows = [
    ...allSummaries
      .filter((b) => b.isOption)
      .map((b) => ({
        key: b.id,
        name: b.name,
        group: b.optionGroup,
        price: b.price + allItems.filter((i) => i.building_id === b.id).reduce((s, i) => s + i.line_total, 0),
      })),
    ...allItems
      .filter((i) => i.is_option && !(i.building_id !== null && optionAreaIds.has(i.building_id)))
      .map((i) => ({ key: i.id, name: i.description.trim() || "Untitled item", group: i.option_group?.trim() ?? "", price: i.line_total })),
  ];
  const optionGroups = [...new Set(optionRows.map((r) => r.group))]
    .sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map((g) => [g, optionRows.filter((r) => r.group === g)] as const);
  const itemGroups = new Map<
    string,
    { label: string; qty: number; sellValue: number; costValue: number }
  >();
  for (const item of items) {
    const text = item.description.trim();
    const roleTitle =
      item.scaffold_role === "edt" ? "Scaffold EDT" : item.scaffold_role === "hire" ? "Scaffold hire" : null;
    const label = roleTitle ? (text ? `${roleTitle} — ${text}` : roleTitle) : text || "(no description)";
    const key = label.toLowerCase();
    const costValue =
      item.markup_pct !== null
        ? item.unit_price * item.quantity
        : item.line_total / (1 + markupOtherPct);
    const existing = itemGroups.get(key);
    if (existing) {
      existing.qty += item.quantity;
      existing.sellValue += item.line_total;
      existing.costValue += costValue;
    } else {
      itemGroups.set(key, { label, qty: item.quantity, sellValue: item.line_total, costValue });
    }
  }
  const otherItemRows = Array.from(itemGroups.values())
    .map((g) => ({
      ...g,
      sellRate: g.qty > 0 ? g.sellValue / g.qty : 0,
      costRate: g.qty > 0 ? g.costValue / g.qty : 0,
    }))
    .sort((a, b) => b.sellValue - a.sellValue);
  const otherItemsSell = otherItemRows.reduce((s, r) => s + r.sellValue, 0);
  const otherItemsCost = otherItemRows.reduce((s, r) => s + r.costValue, 0);

  // Allowances — flat $ with cost = sell (no mark-up), matching the
  // spreadsheet exactly.
  const allowanceSite = quote.allowance_site ?? 0;
  const allowanceOther = quote.allowance_other ?? 0;
  const allowancesSell = allowanceSite + allowanceOther;

  const grandSell = buildingsSubtotal + otherItemsSell + allowancesSell;
  const grandCost =
    labourCost +
    washCostTotal +
    paintCost +
    nightShiftCostTotal +
    oohCostTotal +
    otherItemsCost +
    allowancesSell;
  const gpPct = grandSell > 0 ? (grandSell - grandCost) / grandSell : 0;

  const negotiatingFactorPct = quote.negotiating_factor_pct ?? 0;
  const negotiatingFactorAmount = Math.round(grandSell * negotiatingFactorPct * 100) / 100;
  const taxRate = (settings?.gst_pct ?? 0.15) * 100;
  const netTotal = grandSell + negotiatingFactorAmount;
  const finalTotal = netTotal * (1 + taxRate / 100);

  function categoryRow(label: string, sell: number, cost: number) {
    return (
      <tr className="border-t border-border bg-background/50 text-sm font-semibold text-ink">
        <td className="px-3 py-2" colSpan={4}>
          {label}
        </td>
        <td className="px-3 py-2">{fmtCurrency(sell)}</td>
        <td className="px-3 py-2" />
        <td className="px-3 py-2">{fmtCurrency(cost)}</td>
      </tr>
    );
  }

  // The Area table's price per area is its painting plus its own Access and
  // Other items, so an area that's all access (like "Access") still shows
  // its $, and the table's total ties to the job's Sell subtotal. Items that
  // aren't in any area get one catch-all row rather than dropping out.
  const itemsByArea = new Map<string, number>();
  let itemsWithoutArea = 0;
  for (const item of items) {
    if (item.building_id) {
      itemsByArea.set(item.building_id, (itemsByArea.get(item.building_id) ?? 0) + item.line_total);
    } else {
      itemsWithoutArea += item.line_total;
    }
  }
  const areaRows: AreaRow[] = buildingSummaries.map((b) => ({
    id: b.id,
    name: b.name,
    category: b.category as "Interior" | "Exterior",
    hours: b.hours,
    litres: b.litres,
    price: b.price + (itemsByArea.get(b.id) ?? 0),
    selected: b.selected,
  }));
  if (itemsWithoutArea > 0) {
    areaRows.push({
      id: null,
      name: "Other items (not in an area)",
      category: "Exterior",
      hours: 0,
      litres: 0,
      price: itemsWithoutArea,
      selected: false,
    });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Quotation Summary</h1>
          <p className="mt-1 text-sm text-muted">
            {customerName} · {quote.project || quote.location || "Untitled"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <QuoteStatusChip status={quote.status} />
          <Link
            href={`/costing/${id}`}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-background"
          >
            Edit costing
          </Link>
        </div>
      </div>

      {buildingSummaries.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-5 py-6 text-center text-sm text-muted shadow-sm">
          No buildings/areas yet.
        </p>
      ) : (
        <AreaSummaryTable rows={areaRows} />
      )}

      {optionRows.length > 0 && (
        <div className="mb-6 rounded-xl border border-dashed border-amber-500 bg-surface p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Options</h2>
          <p className="mb-2 text-xs text-muted">Priced separately — not included in any total on this page (excl. GST).</p>
          {optionGroups.map(([group, rows]) => (
            <div key={group || "standalone"} className="mt-2">
              {group && <p className="text-xs font-semibold uppercase tracking-wide text-muted">{group} · pick one</p>}
              {rows.map((r) => (
                <div key={r.key} className="mt-1 flex justify-between gap-3 text-sm">
                  <span>{r.name}</span>
                  <span className="font-medium">{fmtCurrency(r.price)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">Repaint Breakdown</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-3 py-2.5">Items/Description</th>
              <th className="px-3 py-2.5">Detail</th>
              <th className="px-3 py-2.5">No.</th>
              <th className="px-3 py-2.5">Sell Rate</th>
              <th className="px-3 py-2.5">Sell Value</th>
              <th className="px-3 py-2.5">Cost Rate</th>
              <th className="px-3 py-2.5">Cost Value</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="px-3 py-2 text-ink">Labour</td>
              <td className="px-3 py-2 text-muted">Hours</td>
              <td className="px-3 py-2 text-muted">{labourHours.toFixed(1)}</td>
              <td className="px-3 py-2 text-muted">{fmtCurrency(labourRateSell)}</td>
              <td className="px-3 py-2 font-medium">{fmtCurrency(labourSell)}</td>
              <td className="px-3 py-2 text-muted">{fmtCurrency(labourRateCost)}</td>
              <td className="px-3 py-2 font-medium">{fmtCurrency(labourCost)}</td>
            </tr>

            {washHoursTotal > 0 && (
              <tr className="border-b border-border">
                <td className="px-3 py-2 text-ink">Wash</td>
                <td className="px-3 py-2 text-muted">Hours</td>
                <td className="px-3 py-2 text-muted">{washHoursTotal.toFixed(1)}</td>
                <td className="px-3 py-2 text-muted">{fmtCurrency(washSellTotal / washHoursTotal)}</td>
                <td className="px-3 py-2 font-medium">{fmtCurrency(washSellTotal)}</td>
                <td className="px-3 py-2 text-muted">{fmtCurrency(washCostTotal / washHoursTotal)}</td>
                <td className="px-3 py-2 font-medium">{fmtCurrency(washCostTotal)}</td>
              </tr>
            )}

            {paintRows.length === 0 ? (
              <tr className="border-b border-border">
                <td className="px-3 py-2 text-ink">Paint</td>
                <td className="px-3 py-2 text-muted" colSpan={6}>
                  No paint used
                </td>
              </tr>
            ) : (
              paintRows.map((r, i) => (
                <tr key={r.id} className="border-b border-border">
                  <td className="px-3 py-2 text-ink">{i === 0 ? "Paint" : ""}</td>
                  <td className="px-3 py-2 text-muted">{r.label}</td>
                  <td className="px-3 py-2 text-muted">{r.litres.toFixed(1)}</td>
                  <td className="px-3 py-2 text-muted">{fmtCurrency(r.sellRate)}</td>
                  <td className="px-3 py-2 font-medium">{fmtCurrency(r.sellValue)}</td>
                  <td className="px-3 py-2 text-muted">{fmtCurrency(r.costRate)}</td>
                  <td className="px-3 py-2 font-medium">{fmtCurrency(r.costValue)}</td>
                </tr>
              ))
            )}
            {categoryRow("Paint", paintSell, paintCost)}

            {nightShiftHoursTotal > 0 && (
              <>
                <tr className="border-b border-border">
                  <td className="px-3 py-2 text-ink">Night shift</td>
                  <td className="px-3 py-2 text-muted">Allowance</td>
                  <td className="px-3 py-2 text-muted">{nightShiftHoursTotal.toFixed(1)}</td>
                  <td className="px-3 py-2 text-muted">
                    {fmtCurrency(nightShiftHoursTotal > 0 ? nightShiftSell / nightShiftHoursTotal : 0)}
                  </td>
                  <td className="px-3 py-2 font-medium">{fmtCurrency(nightShiftSell)}</td>
                  <td className="px-3 py-2 text-muted">
                    {fmtCurrency(nightShiftHoursTotal > 0 ? nightShiftCostTotal / nightShiftHoursTotal : 0)}
                  </td>
                  <td className="px-3 py-2 font-medium">{fmtCurrency(nightShiftCostTotal)}</td>
                </tr>
              </>
            )}

            {oohHoursTotal > 0 && (
              <tr className="border-b border-border">
                <td className="px-3 py-2 text-ink">Out of hours</td>
                <td className="px-3 py-2 text-muted">Allowance</td>
                <td className="px-3 py-2 text-muted">{oohHoursTotal.toFixed(1)}</td>
                <td className="px-3 py-2 text-muted">{fmtCurrency(oohSellTotal / oohHoursTotal)}</td>
                <td className="px-3 py-2 font-medium">{fmtCurrency(oohSellTotal)}</td>
                <td className="px-3 py-2 text-muted">{fmtCurrency(oohCostTotal / oohHoursTotal)}</td>
                <td className="px-3 py-2 font-medium">{fmtCurrency(oohCostTotal)}</td>
              </tr>
            )}

            {otherItemRows.length === 0 ? (
              <tr className="border-b border-border">
                <td className="px-3 py-2 text-ink">Access &amp; Other items</td>
                <td className="px-3 py-2 text-muted" colSpan={6}>
                  No other items
                </td>
              </tr>
            ) : (
              otherItemRows.map((r, i) => (
                <tr key={r.label} className="border-b border-border">
                  <td className="px-3 py-2 text-ink">{i === 0 ? "Access & Other items" : ""}</td>
                  <td className="px-3 py-2 text-muted">{r.label}</td>
                  <td className="px-3 py-2 text-muted">{r.qty}</td>
                  <td className="px-3 py-2 text-muted">{fmtCurrency(r.sellRate)}</td>
                  <td className="px-3 py-2 font-medium">{fmtCurrency(r.sellValue)}</td>
                  <td className="px-3 py-2 text-muted">{fmtCurrency(r.costRate)}</td>
                  <td className="px-3 py-2 font-medium">{fmtCurrency(r.costValue)}</td>
                </tr>
              ))
            )}
            {categoryRow("Access & Other items", otherItemsSell, otherItemsCost)}

            <AllowancesEditor quoteId={id} initialSite={allowanceSite} initialOther={allowanceOther} />
            {categoryRow("Allowances", allowancesSell, allowancesSell)}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-background font-semibold text-ink">
              <td className="px-3 py-3" colSpan={4}>
                Total
              </td>
              <td className="px-3 py-3">{fmtCurrency(grandSell)}</td>
              <td className="px-3 py-3">{(gpPct * 100).toFixed(1)}% GP</td>
              <td className="px-3 py-3">{fmtCurrency(grandCost)}</td>
            </tr>
          </tfoot>
        </table>
        {gpPct < 0.3 && (
          <p className="border-t border-border bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            GP is below 30%.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <SchedulingEditor
          quoteId={id}
          initialMen={quote.schedule_men ?? 4}
          initialHoursPerWeek={quote.schedule_hours_per_week ?? 40}
          totalHours={totalQuoteHours + washItemHours(items)}
        />
        <div className="w-full max-w-xs ml-auto flex-none rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Sell subtotal</span>
            <span className="font-medium">{fmtCurrency(grandSell)}</span>
          </div>
          <div className="mt-1.5 flex justify-between text-sm">
            <span className="text-muted">Negotiating Factor ({Math.round(negotiatingFactorPct * 10000) / 100}%)</span>
            <span className="font-medium">{fmtCurrency(negotiatingFactorAmount)}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-base">
            <span className="font-semibold text-ink">Net</span>
            <span className="font-semibold text-ink">{fmtCurrency(netTotal)}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted">GST ({taxRate}%)</span>
            <span className="font-medium">{fmtCurrency(netTotal * (taxRate / 100))}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-border pt-3 text-base">
            <span className="font-semibold text-ink">Total</span>
            <span className="font-semibold text-ink">{fmtCurrency(finalTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
