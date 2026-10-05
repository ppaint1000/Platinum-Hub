// The hazard register (HazardCo's Hazard/Risk Register): the common
// hazards in the work, how they're controlled, and the risk before and
// after. Everyone sees it; managers keep it up to date.
import { safetyContext } from "@/lib/safety/data";
import { HazardRegister, type HazardRow } from "@/components/safety/HazardRegister";

export default async function SafetyHazardsPage() {
  const { supabase, isManager } = await safetyContext();
  const { data } = await supabase
    .from("safety_hazards")
    .select("id, hazard, harm, risk_before, controls, risk_after, responsible, review_on, active")
    .order("active", { ascending: false })
    .order("hazard")
    .returns<HazardRow[]>();
  return <HazardRegister rows={data ?? []} canEdit={isManager} />;
}
