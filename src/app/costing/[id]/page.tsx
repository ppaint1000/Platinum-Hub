import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuoteEditor } from "@/components/quotes/QuoteEditor";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: quote },
    { data: buildings },
    { data: lineItems },
    { data: customers },
    { data: paintProducts },
    { data: surfaceTypes },
    { data: accessRates },
    { data: settings },
    { data: lineItemNames },
  ] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", id).single(),
    supabase
      .from("quote_buildings")
      .select("*, quote_building_lines(*)")
      .eq("quote_id", id)
      .order("sort_order"),
    supabase.from("quote_line_items").select("*").eq("quote_id", id).order("sort_order"),
    supabase
      .from("clients")
      .select("id, name")
      .order("name"),
    supabase.from("paint_products").select("*").eq("is_active", true).order("name"),
    supabase
      .from("costing_surface_types")
      .select("id, name, category, unit, labour_productivity_sqm_per_hr")
      .eq("is_active", true)
      .order("category")
      .order("sort_order"),
    supabase
      .from("costing_access_rates")
      .select("id, name, rate_type, unit, cost")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("costing_settings")
      .select(
        "labour_rate_sell, labour_rate_cost, gst_pct, markup_material_pct, markup_other_pct, negotiating_factor_pct, paint_flat_addition, repaint_coats, spread_rate_sqm_per_litre, general_prep_rate_sqm_per_hr, exterior_wash_rate, exterior_wash_markup_pct, night_shift_allowance_rate"
      )
      .limit(1)
      .maybeSingle(),
    supabase.from("costing_line_item_names").select("name").order("name"),
  ]);

  if (!quote) notFound();

  const nightShiftAllowanceRate = settings?.night_shift_allowance_rate ?? 5;

  type RawLine = {
    id: string;
    building_id: string;
    surface_name: string;
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
    paint_product_id: string | null;
    line_type: "surface" | "wash" | "sundry" | "hourly" | null;
    unit_price?: number | null;
    markup_pct?: number | null;
  };

  const initialBuildings = (buildings ?? []).map((b) => ({
    id: b.id,
    quote_id: b.quote_id,
    name: b.name,
    sort_order: b.sort_order,
    category: b.category ?? "Internal",
    excludes: b.excludes ?? "",
    note: b.note ?? "",
    overtime_enabled: b.overtime_enabled,
    sheeting_up_enabled: b.sheeting_up_enabled ?? true,
    sheeting_up_pct: b.sheeting_up_pct ?? 0.1,
    night_shift_enabled: b.night_shift_enabled ?? false,
    night_shift_rate: b.night_shift_rate ?? nightShiftAllowanceRate,
    out_of_hours_enabled: b.out_of_hours_enabled ?? false,
    out_of_hours_rate: b.out_of_hours_rate ?? 0,
    auto_wash_enabled: b.auto_wash_enabled ?? true,
    is_option: b.is_option ?? false,
    option_group: b.option_group ?? null,
    lines: ((b.quote_building_lines ?? []) as RawLine[])
      .sort((a, c) => a.sort_order - c.sort_order)
      .map((l) => ({
        ...l,
        line_type: l.line_type ?? "surface",
        // Nothing looks "manually changed" right after loading — these
        // snapshots are what the change-highlighting compares against.
        default_coats: l.coats,
        default_labour_rate: l.labour_rate,
        default_spread_rate: l.spread_rate,
        default_prep_rate: l.prep_rate,
        // Only a hand-entered Wash line has these (migration 028).
        unit_price: l.unit_price ?? null,
        markup_pct: l.markup_pct ?? null,
      })),
  }));

  return (
    <QuoteEditor
      quote={quote}
      initialBuildings={initialBuildings}
      initialLineItems={(lineItems ?? []).map((i) => ({
        ...i,
        is_access: i.is_access ?? false,
        scaffold_group: i.scaffold_group ?? null,
        scaffold_role: i.scaffold_role ?? null,
      }))}
      customers={customers ?? []}
      paintProducts={paintProducts ?? []}
      surfaceTypes={surfaceTypes ?? []}
      accessRates={accessRates ?? []}
      labourRateSell={settings?.labour_rate_sell ?? 55}
      labourRateCost={settings?.labour_rate_cost ?? 30}
      gstRatePct={(settings?.gst_pct ?? 0.15) * 100}
      markupMaterialPct={settings?.markup_material_pct ?? 0.2}
      markupOtherPct={settings?.markup_other_pct ?? 0.2}
      negotiatingFactorPct={settings?.negotiating_factor_pct ?? -0.1}
      paintFlatAddition={settings?.paint_flat_addition ?? 1.6}
      repaintCoats={settings?.repaint_coats ?? 2}
      spreadRateSqmPerLitre={settings?.spread_rate_sqm_per_litre ?? 12}
      generalPrepRateSqmPerHr={settings?.general_prep_rate_sqm_per_hr ?? 50}
      exteriorWashRate={settings?.exterior_wash_rate ?? 70}
      exteriorWashMarkupPct={settings?.exterior_wash_markup_pct ?? 0.2}
      nightShiftAllowanceRate={nightShiftAllowanceRate}
      lineItemNames={(lineItemNames ?? []).map((r) => r.name)}
    />
  );
}
