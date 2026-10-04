import { createClient } from "@/lib/supabase/server";
import { AccessRatesClient } from "@/components/quotes/AccessRatesClient";
import { requireMcAccess } from "@/lib/quotes/mcAccess";

export default async function AccessRatesPage() {
  await requireMcAccess("admin");
  const supabase = await createClient();

  const [{ data: rates }, { data: settings }] = await Promise.all([
    supabase
      .from("costing_access_rates")
      .select("id, name, rate_type, unit, cost, is_active")
      .order("sort_order"),
    supabase.from("costing_settings").select("markup_other_pct").limit(1).maybeSingle(),
  ]);

  return (
    <AccessRatesClient
      initialRates={rates ?? []}
      markupOtherPct={settings?.markup_other_pct ?? 0.2}
    />
  );
}
