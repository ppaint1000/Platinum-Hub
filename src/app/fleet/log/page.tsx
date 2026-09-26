import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SignOutButton } from "@/components/SignOutButton";
import { FuelEntryForm } from "@/components/fleet/FuelEntryForm";

export default async function DriverFuelLogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: access }] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", user?.id ?? "").single(),
    supabase.from("user_app_access").select("timesheets").eq("user_id", user?.id ?? "").maybeSingle(),
  ]);

  // Where the back link (top of the form and on "Entry saved") goes:
  // admins/supervisors back to the Hub; painters live in Timesheets
  // (/timesheets routes them to their clock), so straight back there.
  const isHubUser = profile?.role === "admin" || profile?.role === "supervisor";
  const backLink = isHubUser
    ? { href: "/hub", label: "Back to Hub" }
    : access?.timesheets
    ? { href: "/timesheets", label: "Back to Timesheets" }
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
        .in("status", ["won", "in_progress"])
        .order("name")
        .returns<{ id: string; job_number: string | null; name: string; client: { name: string } | null }[]>()
    : { data: [] };

  // Default the picker to whichever vehicle is assigned to the signed-in
  // driver (Fleet -> Vehicles), falling back to the first one.
  const defaultVehicleId =
    (vehicles ?? []).find((v) => v.assigned_driver_id === user?.id)?.id ?? vehicles?.[0]?.id ?? "";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6">
      <header className="flex items-center justify-between">
        <Image
          src="/logo.webp"
          alt="Platinum Painters"
          width={140}
          height={56}
          priority
          className="h-8 w-auto"
        />
        <SignOutButton className="text-sm font-medium text-muted transition hover:text-ink" />
      </header>

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
  );
}
