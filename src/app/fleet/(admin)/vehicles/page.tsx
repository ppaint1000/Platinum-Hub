import { createClient } from "@/lib/supabase/server";
import { VehiclesClient } from "@/components/fleet/VehiclesClient";
import { currentOdometer, nextServiceFor } from "@/lib/fleet/nextService";

export default async function VehiclesPage() {
  const supabase = await createClient();

  const [{ data: vehicles }, { data: drivers }, { data: services }, { data: fuel }] = await Promise.all([
    supabase
      .from("vehicles")
      .select(
        "id, plate, make, model, year, current_odometer_km, assigned_driver_id, wof_expiry, rego_expiry, next_service_km, next_service_date, notes, fuel_type, ruc_paid_to_km"
      )
      .order("plate"),
    supabase.from("profiles").select("id, full_name").neq("role", "admin").order("full_name"),
    supabase.from("service_records").select("vehicle_id, date, odometer_km, next_due_odometer_km"),
    supabase.from("fuel_entries").select("vehicle_id, odometer_km").not("odometer_km", "is", null),
  ]);

  // Each vehicle's next service and odometer now (for its RUC km left).
  const status = Object.fromEntries(
    (vehicles ?? []).map((v) => [
      v.id,
      { next: nextServiceFor(v, services ?? [], fuel ?? []), odometer: currentOdometer(v, fuel ?? []) },
    ])
  );

  return <VehiclesClient initialVehicles={vehicles ?? []} drivers={drivers ?? []} status={status} />;
}
