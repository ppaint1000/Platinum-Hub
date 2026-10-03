import { createClient } from "@/lib/supabase/server";
import { PaintProductsClient } from "@/components/quotes/PaintProductsClient";
import { requireMcAccess } from "@/lib/quotes/mcAccess";

export default async function PaintProductsPage() {
  await requireMcAccess("admin");
  const supabase = await createClient();

  const [{ data: products }, { data: settings }] = await Promise.all([
    supabase
      .from("paint_products")
      .select("id, name, brand, cost_per_litre, coverage_sqm_per_litre, is_active, is_default")
      .order("name"),
    supabase
      .from("costing_settings")
      .select("markup_material_pct, paint_flat_addition")
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    <PaintProductsClient
      initialProducts={products ?? []}
      markupMaterialPct={settings?.markup_material_pct ?? 0.2}
      paintFlatAddition={settings?.paint_flat_addition ?? 1.6}
    />
  );
}
