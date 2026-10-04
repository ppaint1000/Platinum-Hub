import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HubTopBar } from "@/components/dashboard/HubTopBar";
import { FuelEntryForm } from "@/components/fleet/FuelEntryForm";

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

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, plate, make, model, assigned_driver_id")
    .order("plate");

  // Jobs a waterblaster fill-up can be charged to. Read with the service
  // role because drivers have no RLS access to jobs - only the id/number/
  // name/client of live jobs is exposed, nothing financial.
  const { data: jobs } = user
    ? await createAdminClient()
        .from("jobs")
        .select("id, job_number, name, client:clients(name)")
        .in("status", ["won", "scheduled", "in_progress"])
        .order("name")
        .returns<{ id: string; job_number: string | null; name: string; client: { name: string } | null }[]>()
    : { data: [] };

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
