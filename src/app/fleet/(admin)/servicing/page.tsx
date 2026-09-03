import { createClient } from "@/lib/supabase/server";
import { ServicingClient } from "@/components/fleet/ServicingClient";

export default async function ServicingPage() {
  const supabase = await createClient();

  const [{ data: records }, { data: vehicles }] = await Promise.all([
    supabase
      .from("service_records")
      .select(
        "id, vehicle_id, date, odometer_km, type, description, cost, next_due_date, next_due_odometer_km, vehicle:vehicles(plate, make, model)"
      )
      .order("date", { ascending: false }),
    supabase.from("vehicles").select("id, plate, make, model").order("plate"),
  ]);

  return <ServicingClient initialRecords={records ?? []} vehicles={vehicles ?? []} />;
}
