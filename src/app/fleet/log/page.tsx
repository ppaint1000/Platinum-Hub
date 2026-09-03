import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
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
    .select("id, plate, make, model")
    .order("plate");

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
          photograph the receipt and the odometer, then fill in the numbers.
        </p>
      </div>

      <FuelEntryForm vehicles={vehicles ?? []} />
    </main>
  );
}
