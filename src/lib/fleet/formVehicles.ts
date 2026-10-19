// The vehicle list for the admin fuel forms (Fuel Log, Waterblaster Fuel):
// each vehicle plus, for hubodometer vehicles, its last readings so the
// form can ask for the hubo and check it (lib/fleet/hubodometer.ts).
import { createClient } from "@/lib/supabase/server";
import { huboHint, type HuboHint } from "./hubodometer";

export type FormVehicle = {
  id: string;
  plate: string;
  make: string;
  model: string;
  assigned_driver_id: string | null;
  usesHubo: boolean;
  huboHint: HuboHint | null;
};

type VehicleRow = {
  id: string;
  plate: string;
  make: string;
  model: string;
  assigned_driver_id: string | null;
  ruc_meter: string | null;
  current_odometer_km: number | null;
  current_hubodometer_km: number | null;
};

export async function fuelFormVehicles(): Promise<FormVehicle[]> {
  const supabase = await createClient();
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, plate, make, model, assigned_driver_id, ruc_meter, current_odometer_km, current_hubodometer_km")
    .order("plate")
    .returns<VehicleRow[]>();

  const huboIds = (vehicles ?? []).filter((v) => v.ruc_meter === "hubodometer").map((v) => v.id);
  const { data: fuel } = huboIds.length
    ? await supabase
        .from("fuel_entries")
        .select("vehicle_id, odometer_km, hubodometer_km, fuelled_on")
        .in("vehicle_id", huboIds)
    : { data: [] };

  return (vehicles ?? []).map((v) => ({
    id: v.id,
    plate: v.plate,
    make: v.make,
    model: v.model,
    assigned_driver_id: v.assigned_driver_id,
    usesHubo: v.ruc_meter === "hubodometer",
    huboHint: v.ruc_meter === "hubodometer" ? huboHint(v, fuel ?? []) : null,
  }));
}
