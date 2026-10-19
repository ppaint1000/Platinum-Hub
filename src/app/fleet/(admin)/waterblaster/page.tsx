import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WaterblasterFuelClient, type WaterblasterRow } from "@/components/fleet/WaterblasterFuelClient";
import { AddFuelEntryButton } from "@/components/fleet/AddFuelEntryButton";
import { fuelFormVehicles, type FormVehicle } from "@/lib/fleet/formVehicles";
import { latestJobByUser } from "@/lib/jobs/recentClockIns";

type FuelRow = {
  id: string;
  driver_id: string;
  vehicle_id: string | null;
  equipment: string | null;
  job_id: string | null;
  fuelled_on: string;
  odometer_km: number | null;
  litres: number | null;
  cost_total: number | null;
  receipt_photo_path: string | null;
  driver: { full_name: string } | null;
};

type JobRow = { id: string; job_number: string | null; name: string; client: { name: string } | null };

const jobLabel = (j: JobRow) => [j.job_number, j.name, j.client?.name].filter(Boolean).join(" — ");

// Waterblaster fuel on its own - kept out of the vehicle Fuel Log and Fuel
// Report. Lists every fill-up with who, which job and the amount, and the
// client totals it by week / month / quarter / financial year.
export default async function WaterblasterFuelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user?.id ?? "").single();
  const isAdmin = profile?.role === "admin";

  const { data: entries } = await supabase
    .from("fuel_entries")
    .select(
      "id, driver_id, vehicle_id, equipment, job_id, fuelled_on, odometer_km, litres, cost_total, receipt_photo_path, driver:profiles(full_name)"
    )
    .eq("equipment", "waterblaster")
    .order("fuelled_on", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<FuelRow[]>();

  // Job names via the service role - supervisors can't read jobs directly.
  // Newest first, for the admin Add / Edit forms' job pickers too.
  const [{ data: jobs }, { data: drivers }, vehicles, lastJobs] = await Promise.all([
    createAdminClient()
      .from("jobs")
      .select("id, job_number, name, client:clients(name)")
      .order("created_at", { ascending: false })
      .returns<JobRow[]>(),
    isAdmin
      ? supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name").returns<{ id: string; full_name: string }[]>()
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    isAdmin ? fuelFormVehicles() : Promise.resolve([] as FormVehicle[]),
    isAdmin ? latestJobByUser() : Promise.resolve(new Map<string, string>()),
  ]);

  const jobNames = new Map((jobs ?? []).map((j) => [j.id, jobLabel(j)]));
  const liveJobs = (jobs ?? []).map((j) => ({ id: j.id, label: jobLabel(j) }));

  const rows: WaterblasterRow[] = await Promise.all(
    (entries ?? []).map(async (r) => ({
      id: r.id,
      fuelled_on: r.fuelled_on,
      driver: r.driver?.full_name ?? null,
      job: r.job_id ? jobNames.get(r.job_id) ?? null : null,
      litres: r.litres != null ? Number(r.litres) : null,
      cost: r.cost_total != null ? Number(r.cost_total) : null,
      receiptUrl: r.receipt_photo_path
        ? (await supabase.storage.from("fleet-photos").createSignedUrl(r.receipt_photo_path, 3600)).data?.signedUrl ?? null
        : null,
      entry: {
        id: r.id,
        driver_id: r.driver_id,
        vehicle_id: r.vehicle_id,
        equipment: r.equipment,
        job_id: r.job_id,
        fuelled_on: r.fuelled_on,
        odometer_km: r.odometer_km,
        litres: r.litres,
        cost_total: r.cost_total,
        receipt_photo_path: r.receipt_photo_path,
      },
    }))
  );

  const lists = {
    drivers: (drivers ?? []).map((d) => ({ id: d.id, label: d.full_name })),
    vehicles,
    jobs: liveJobs,
    lastJobByDriver: Object.fromEntries(lastJobs),
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Waterblaster Fuel</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length} fill-up{rows.length === 1 ? "" : "s"} logged · amounts include GST
          </p>
        </div>
        {isAdmin && <AddFuelEntryButton {...lists} startWithWaterblaster />}
      </div>
      <WaterblasterFuelClient rows={rows} editLists={isAdmin ? lists : null} />
    </div>
  );
}
