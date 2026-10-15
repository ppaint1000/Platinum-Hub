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
  attachment_path?: string | null;
  attachment_name?: string | null;
  vehicle: { plate: string; make: string; model: string } | null;
};

const BASE_COLUMNS =
  "id, vehicle_id, date, odometer_km, type, description, cost, next_due_date, next_due_odometer_km, vehicle:vehicles(plate, make, model)";

export default async function ServicingPage() {
  const supabase = await createClient();

  const loadRecords = (columns: string) =>
    supabase.from("service_records").select(columns).order("date", { ascending: false }).returns<ServiceRecordRow[]>();

  const [withFiles, { data: vehicles }] = await Promise.all([
    loadRecords(`${BASE_COLUMNS}, attachment_path, attachment_name`),
    supabase.from("vehicles").select("id, plate, make, model").order("plate"),
  ]);
  // Until fleet_service_attachments.sql has been run the attachment columns
  // don't exist - fall back so the page still lists records (no files).
  const attachmentsReady = !withFiles.error;
  const records = attachmentsReady ? withFiles.data : (await loadRecords(BASE_COLUMNS)).data;

  const formattedRecords = await Promise.all(
    (records ?? []).map(async (r) => {
      const vehicle = Array.isArray(r.vehicle) ? r.vehicle[0] ?? null : r.vehicle;
      const attachmentUrl = r.attachment_path
        ? (await supabase.storage.from("fleet-photos").createSignedUrl(r.attachment_path, 3600)).data?.signedUrl ?? null
        : null;
      return {
        ...r,
        vehicle,
        attachment_path: r.attachment_path ?? null,
        attachment_name: r.attachment_name ?? null,
        attachmentUrl,
      };
    })
  );

  return <ServicingClient initialRecords={formattedRecords} vehicles={vehicles ?? []} attachmentsReady={attachmentsReady} />;
}
