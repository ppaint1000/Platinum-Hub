import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SignOutButton } from "@/components/SignOutButton";
import { FuelEntryForm } from "@/components/fleet/FuelEntryForm";

export default async function DriverFuelLogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user?.id ?? "")
    .single();

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
        jobs={(jobs ?? []).map((j) => ({
          id: j.id,
          label: [j.job_number, j.name, j.client?.name].filter(Boolean).join(" — "),
        }))}
      />
    </main>
  );
}
