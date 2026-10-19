import { createClient } from "@/lib/supabase/server";
import { VehiclesClient } from "@/components/fleet/VehiclesClient";
import { currentOdometer, nextServiceFor } from "@/lib/fleet/nextService";
import { currentHubo, usesHubo } from "@/lib/fleet/hubodometer";

export default async function VehiclesPage() {
  const supabase = await createClient();

  const [{ data: vehicles }, { data: drivers }, { data: services }, { data: fuel }] = await Promise.all([
    supabase
      .from("vehicles")
      .select(
        "id, plate, make, model, year, current_odometer_km, assigned_driver_id, wof_expiry, rego_expiry, next_service_km, next_service_date, notes, fuel_type, ruc_paid_to_km, ruc_meter, current_hubodometer_km"
      )
      .order("plate"),
    supabase.from("profiles").select("id, full_name").neq("role", "admin").order("full_name"),
    supabase.from("service_records").select("vehicle_id, date, odometer_km, next_due_odometer_km"),
    supabase.from("fuel_entries").select("vehicle_id, odometer_km, hubodometer_km, fuelled_on").not("vehicle_id", "is", null),
  ]);

  // Each vehicle's next service, odometer now, and - for hubo vehicles -
  // its hubodometer now (what its RUC km left goes by).
  const status = Object.fromEntries(
    (vehicles ?? []).map((v) => {
      const odometer = currentOdometer(v, fuel ?? []);
      return [
        v.id,
        {
          next: nextServiceFor(v, services ?? [], fuel ?? []),
          odometer,
          hubo: usesHubo(v) ? currentHubo(v, fuel ?? [], odometer) : null,
        },
      ];
    })
  );

  return <VehiclesClient initialVehicles={vehicles ?? []} drivers={drivers ?? []} status={status} />;
}
