import { createClient } from "@/lib/supabase/server";
import { ProductionRatesClient } from "@/components/quotes/ProductionRatesClient";
import { requireMcAccess } from "@/lib/quotes/mcAccess";

export default async function ProductionRatesPage() {
  await requireMcAccess("admin");
  const supabase = await createClient();

  const { data: rates } = await supabase
    .from("costing_surface_types")
    .select("id, name, category, unit, labour_productivity_sqm_per_hr, is_active")
    .order("category")
    .order("sort_order");

  return <ProductionRatesClient initialRates={rates ?? []} />;
}
