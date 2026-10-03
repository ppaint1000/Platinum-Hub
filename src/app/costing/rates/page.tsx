import { createClient } from "@/lib/supabase/server";
import { RatesClient } from "@/components/quotes/RatesClient";
import { requireMcAccess } from "@/lib/quotes/mcAccess";

export default async function RatesPage() {
  await requireMcAccess("admin");
  const supabase = await createClient();

  const [{ data: settings }, { data: paintProducts }] = await Promise.all([
    supabase.from("costing_settings").select("*").limit(1).maybeSingle(),
    supabase
      .from("paint_products")
      .select("id, name, brand, cost_per_litre, is_default")
      .eq("is_active", true)
      .order("name"),
  ]);

  return <RatesClient settings={settings} paintProducts={paintProducts ?? []} />;
}
