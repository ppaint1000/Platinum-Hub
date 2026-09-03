import { createClient } from "@/lib/supabase/server";
import { VehiclesClient } from "@/components/fleet/VehiclesClient";

export default async function VehiclesPage() {
  const supabase = await createClient();

  const [{ data: vehicles }, { data: drivers }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, plate, make, model, year, current_odometer_km, assigned_driver_id, wof_expiry, rego_expiry, notes")
      .order("plate"),
    supabase.from("profiles").select("id, full_name").neq("role", "admin").order("full_name"),
  ]);

  return <VehiclesClient initialVehicles={vehicles ?? []} drivers={drivers ?? []} />;
}
