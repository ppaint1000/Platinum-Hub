// Health & safety → Ladders: the ladder register - every ladder with its
// tag number, details and where it's kept, when it was last inspected and
// when the next one's due (red = overdue or tagged out). Anyone with
// Health & safety can record an inspection; managers keep the register.
import { safetyContext, safetyStaff } from "@/lib/safety/data";
import { SafetyLadders } from "@/components/safety/SafetyLadders";
import type { Ladder, LadderInspection } from "@/lib/safety/laddersShared";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export default async function SafetyLaddersPage() {
  const { supabase, isManager } = await safetyContext();
  const [{ data: ladders, error }, { data: inspections }, staff] = await Promise.all([
    supabase.from("ladders").select("*").order("asset_no").returns<Ladder[]>(),
    supabase.from("ladder_inspections").select("*").order("inspected_on", { ascending: false }).order("created_at", { ascending: false }).returns<LadderInspection[]>(),
    safetyStaff(),
  ]);

  if (error) {
    return <p className="text-sm text-[#5B6472]">The ladder register isn&apos;t set up yet - run supabase/safety_ladders.sql in Supabase.</p>;
  }

  return (
    <SafetyLadders
      ladders={ladders ?? []}
      inspections={inspections ?? []}
      staff={staff}
      isManager={isManager}
      today={nzTodayDateString()}
    />
  );
}
