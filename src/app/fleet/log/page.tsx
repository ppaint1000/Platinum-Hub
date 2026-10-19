import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HubTopBar } from "@/components/dashboard/HubTopBar";
import { FuelEntryForm } from "@/components/fleet/FuelEntryForm";
import { latestJobByUser, withJobFirst } from "@/lib/jobs/recentClockIns";
import { huboHint } from "@/lib/fleet/hubodometer";

export default async function DriverFuelLogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: access }] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", user?.id ?? "").single(),
    supabase.from("user_app_access").select("timesheets, sales").eq("user_id", user?.id ?? "").maybeSingle(),
  ]);

  // Where the back link (top of the form and on "Entry saved") goes:
  // admins/supervisors back to the Hub; sales staff back to their sales
  // dashboard (where they land); painters land on the clock-in page and use
  // it most, so straight back there.
  const isHubUser = profile?.role === "admin" || profile?.role === "supervisor";
  const backLink = isHubUser
    ? { href: "/hub", label: "Back to Hub" }
    : profile?.role === "sales" && access?.sales
    ? { href: "/sales/dashboard", label: "Back to My sales" }
    : access?.timesheets
    ? { href: "/timesheets/clock", label: "Back to clock in" }
    : null;

  const { data: vehicleRows } = await supabase
    .from("vehicles")
    .select("id, plate, make, model, assigned_driver_id, ruc_meter, current_odometer_km, current_hubodometer_km")
    .order("plate");

  // Hubodometer vehicles (the Dynas): their last readings, so the form can
  // suggest the hubo and flag one that doesn't match the odometer. Read with
  // the service role - drivers can't see other people's fill-ups - and only
  // the readings leave the server.
  const huboIds = (vehicleRows ?? []).filter((v) => v.ruc_meter === "hubodometer").map((v) => v.id);
  const { data: huboFuel } = huboIds.length
    ? await createAdminClient()
        .from("fuel_entries")
        .select("vehicle_id, odometer_km, hubodometer_km, fuelled_on")
        .in("vehicle_id", huboIds)
    : { data: [] };
  const vehicles = (vehicleRows ?? []).map((v) => ({
    id: v.id,
    plate: v.plate,
    make: v.make,
    model: v.model,
    assigned_driver_id: v.assigned_driver_id,
    usesHubo: v.ruc_meter === "hubodometer",
    huboHint: v.ruc_meter === "hubodometer" ? huboHint(v, huboFuel ?? []) : null,
  }));

  // Jobs a waterblaster fill-up can be charged to. Read with the service
  // role because drivers have no RLS access to jobs - only the id/number/
  // name/client of live jobs is exposed, nothing financial.
  // Finished jobs too (a fill-up can still be for one); the driver's latest
  // clocked-in job first, then newest jobs first.
  const [{ data: allJobs }, latestJobs] = user
    ? await Promise.all([
        createAdminClient()
          .from("jobs")
          .select("id, job_number, name, status, client:clients(name)")
          .in("status", ["won", "scheduled", "in_progress", "complete", "invoiced", "paid"])
          .order("created_at", { ascending: false })
          .returns<{ id: string; job_number: string | null; name: string; status: string; client: { name: string } | null }[]>(),
        latestJobByUser(),
      ])
    : [{ data: [] }, new Map<string, string>()];
  const jobs = withJobFirst(allJobs ?? [], user ? latestJobs.get(user.id) : null);

  // Default the picker to whichever vehicle is assigned to the signed-in
  // driver (Fleet -> Vehicles), falling back to the first one.
  const defaultVehicleId =
    (vehicles ?? []).find((v) => v.assigned_driver_id === user?.id)?.id ?? vehicles?.[0]?.id ?? "";

  return (
    <>
    <HubTopBar activeHref="/fleet/log" />
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">

      {backLink && (
        <Link
          href={backLink.href}
          className="mt-4 flex items-center gap-1 text-sm font-medium text-muted transition hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {backLink.label}
        </Link>
      )}

      <div className="mt-6">
        <h1 className="text-xl font-semibold text-ink">
          Fuel &amp; mileage
        </h1>
        <p className="mt-1 text-sm text-muted">
          {profile?.full_name ? `${profile.full_name} — ` : ""}
          photograph the receipt and check the numbers it fills in.
        </p>
      </div>

      <FuelEntryForm
        vehicles={vehicles ?? []}
        defaultVehicleId={defaultVehicleId}
        backLink={backLink}
        jobs={(jobs ?? []).map((j) => ({
          id: j.id,
          label: [j.job_number, j.name, j.client?.name].filter(Boolean).join(" — "),
        }))}
      />
    </main>
    </>
  );
}
