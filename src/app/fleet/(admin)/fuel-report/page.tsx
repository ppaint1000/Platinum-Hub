import { createClient } from "@/lib/supabase/server";
import { FuelReportClient } from "@/components/fleet/FuelReportClient";
import type { FuelEntryInput } from "@/lib/fleet/fuelEconomy";

// Fuel cost per km for each vehicle - per fill-up and over a chosen
// period. All the maths is in lib/fleet/fuelEconomy.ts; the page just
// loads every vehicle fill-up (waterblaster entries have no vehicle and
// are left out) and hands them to the client for filtering.
export default async function FuelReportPage() {
  const supabase = await createClient();

  const [{ data: vehicles }, { data: entries }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, plate, make, model")
      .order("plate")
      .returns<{ id: string; plate: string; make: string; model: string }[]>(),
    supabase
      .from("fuel_entries")
      .select("id, vehicle_id, fuelled_on, created_at, odometer_km, litres, cost_total")
      .not("vehicle_id", "is", null)
      .returns<FuelEntryInput[]>(),
  ]);

  return (
    <FuelReportClient
      vehicles={(vehicles ?? []).map((v) => ({ id: v.id, name: `${v.make} ${v.model} — ${v.plate}` }))}
      entries={entries ?? []}
    />
  );
}
