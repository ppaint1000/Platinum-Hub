// The pricing a proposal shows the customer, from a costing: one line per
// area (its painting plus its own Access/Other items, the same as the
// Summary page's Area table), items not in any area as their own lines, and
// every option with its own price. Prices are before GST, with the
// costing's Negotiating Factor applied, rounded to whole dollars.
//
// The per-area sums mirror the Summary page (and QuoteEditor.tsx's
// hoursFor/sheetingUpFor/prepCostFor/nightShiftFor) exactly.

import type { SupabaseClient } from "@supabase/supabase-js";

export type PricingLine = { key: string; label: string; price: number };
export type PricingOption = PricingLine & { group: string };
export type ProposalPricing = { items: PricingLine[]; options: PricingOption[]; total: number };

type Line = {
  line_type?: string | null;
  qty: number;
  hours: number;
  prep_hours: number;
  cost: number;
  unit_price?: number | null;
};
type Building = {
  id: string;
  name: string | null;
  sheeting_up_enabled: boolean;
  sheeting_up_pct: number;
  night_shift_enabled: boolean | null;
  night_shift_rate: number | null;
  out_of_hours_enabled?: boolean | null;
  out_of_hours_rate?: number | null;
  is_option?: boolean | null;
  option_group?: string | null;
  quote_building_lines: Line[] | null;
};
type Item = {
  id: string;
  building_id: string | null;
  description: string;
  line_total: number;
  is_option?: boolean | null;
  option_group?: string | null;
};

const dollars = (n: number) => Math.round(n);

export async function proposalPricing(
  supabase: SupabaseClient,
  quoteId: string,
  labels: Record<string, string> = {}
): Promise<ProposalPricing> {
  const [{ data: quote }, { data: buildingRows }, { data: itemRows }, { data: settings }] = await Promise.all([
    supabase.from("quotes").select("labour_sell_override, negotiating_factor_pct").eq("id", quoteId).single(),
    supabase.from("quote_buildings").select("*, quote_building_lines(*)").eq("quote_id", quoteId).order("sort_order"),
    supabase
      .from("quote_line_items")
      .select("id, building_id, description, line_total, is_option, option_group")
      .eq("quote_id", quoteId)
      .order("sort_order"),
    supabase.from("costing_settings").select("labour_rate_sell, markup_other_pct").limit(1).maybeSingle(),
  ]);

  const labourRateSell = quote?.labour_sell_override ?? settings?.labour_rate_sell ?? 55;
  const markupOtherPct = settings?.markup_other_pct ?? 0.2;
  const factor = 1 + Number(quote?.negotiating_factor_pct ?? 0);

  const buildings = (buildingRows ?? []) as Building[];
  const items = (itemRows ?? []) as Item[];
  const optionAreaIds = new Set(buildings.filter((b) => b.is_option).map((b) => b.id));

  function areaPrice(b: Building): number {
    const lines = b.quote_building_lines ?? [];
    const rawHours = lines.reduce((s, l) => s + Number(l.hours), 0);
    const prepHours = lines.reduce((s, l) => s + Number(l.prep_hours), 0);
    const linesCost = lines.reduce((s, l) => s + Number(l.cost), 0);
    const notSheeted = lines
      .filter((l) => l.line_type === "hourly" || (l.line_type === "wash" && l.unit_price != null))
      .reduce((s, l) => s + Number(l.hours), 0);
    const sheetingHours = b.sheeting_up_enabled ? Number(b.sheeting_up_pct) * (rawHours - notSheeted) : 0;
    const totalHours = rawHours + prepHours + sheetingHours;
    const nightOn = !!b.night_shift_enabled;
    const oohOn = !nightOn && !!b.out_of_hours_enabled;
    const shiftRate = nightOn ? Number(b.night_shift_rate ?? 0) : oohOn ? Number(b.out_of_hours_rate ?? 0) : 0;
    const shiftSell = nightOn || oohOn ? totalHours * shiftRate * (1 + markupOtherPct) : 0;
    // Its own items - except any that are options of their own (an option
    // area takes all of its items with it).
    const ownItems = items
      .filter((i) => i.building_id === b.id && (b.is_option || !i.is_option))
      .reduce((s, i) => s + Number(i.line_total), 0);
    return linesCost + prepHours * labourRateSell + sheetingHours * labourRateSell + shiftSell + ownItems;
  }

  const label = (key: string, fallback: string) => labels[key]?.trim() || fallback;

  const lines: PricingLine[] = [
    ...buildings
      .filter((b) => !b.is_option)
      .map((b) => ({ key: b.id, label: label(b.id, b.name?.trim() || "Untitled area"), price: dollars(areaPrice(b) * factor) })),
    ...items
      .filter((i) => !i.building_id && !i.is_option)
      .map((i) => ({ key: i.id, label: label(i.id, i.description.trim() || "Other item"), price: dollars(Number(i.line_total) * factor) })),
  ].filter((l) => l.price !== 0);

  const options: PricingOption[] = [
    ...buildings
      .filter((b) => b.is_option)
      .map((b) => ({
        key: b.id,
        label: label(b.id, b.name?.trim() || "Untitled area"),
        group: b.option_group?.trim() ?? "",
        price: dollars(areaPrice(b) * factor),
      })),
    ...items
      .filter((i) => i.is_option && !(i.building_id !== null && optionAreaIds.has(i.building_id)))
      .map((i) => ({
        key: i.id,
        label: label(i.id, i.description.trim() || "Option"),
        group: i.option_group?.trim() ?? "",
        price: dollars(Number(i.line_total) * factor),
      })),
  ];

  return { items: lines, options, total: lines.reduce((s, l) => s + l.price, 0) };
}
