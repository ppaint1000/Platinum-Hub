import { createClient } from "@/lib/supabase/server";
import { ComplianceClient } from "@/components/fleet/ComplianceClient";

export default async function CompliancePage() {
  const supabase = await createClient();
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, plate, make, model, wof_expiry, rego_expiry");

  return <ComplianceClient vehicles={vehicles ?? []} />;
}
