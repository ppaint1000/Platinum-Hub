import { createClient } from "@/lib/supabase/server";
import { ServicingClient } from "@/components/fleet/ServicingClient";

type ServiceRecordRow = {
  id: string;
  vehicle_id: string;
  date: string;
  odometer_km: number | null;
  type: string | null;
  description: string | null;
  cost: number | null;
  next_due_date: string | null;
  next_due_odometer_km: number | null;
  vehicle: { plate: string; make: string; model: string } | null;
};

export default async function ServicingPage() {
  const supabase = await createClient();

  const [{ data: records }, { data: vehicles }] = await Promise.all([
    supabase
      .from("service_records")
      .select(
        "id, vehicle_id, date, odometer_km, type, description, cost, next_due_date, next_due_odometer_km, vehicle:vehicles(plate, make, model)"
      )
      .order("date", { ascending: false })
      .returns<ServiceRecordRow[]>(),
    supabase.from("vehicles").select("id, plate, make, model").order("plate"),
  ]);

  return <ServicingClient initialRecords={records ?? []} vehicles={vehicles ?? []} />;
}
