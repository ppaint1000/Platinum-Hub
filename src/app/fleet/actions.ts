"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { missingFuelNumbers } from "@/lib/fleet/missingNumbers";

// Called by the driver fuel form right after it saves an entry. If the
// entry is missing its mileage / litres / cost, every active admin gets an
// email pointing them at Fleet → Fuel Log to fill it in. Re-reads the
// entry server-side rather than trusting the form, and only the driver who
// logged it can trigger the email.
export async function alertIncompleteFuelEntryAction(entryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { data: entry } = await admin
    .from("fuel_entries")
    .select(
      "id, driver_id, equipment, odometer_km, litres, cost_total, fuelled_on, vehicle:vehicles(plate, make, model), driver:profiles(full_name)"
    )
    .eq("id", entryId)
    .single<{
      id: string;
      driver_id: string;
      equipment: string | null;
      odometer_km: number | null;
      litres: number | null;
      cost_total: number | null;
      fuelled_on: string;
      vehicle: { plate: string; make: string; model: string } | null;
      driver: { full_name: string } | null;
    }>();

  if (!entry || entry.driver_id !== user.id) return { error: "Entry not found." };

  const missing = missingFuelNumbers(entry);
  if (missing.length === 0) return {};

  const { data: admins } = await admin
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .eq("is_active", true)
    .returns<{ email: string | null }[]>();
  const to = (admins ?? []).map((a) => a.email).filter(Boolean).join(", ");
  if (!to) return {};

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const vehicleName = entry.vehicle
    ? `${entry.vehicle.make} ${entry.vehicle.model} — ${entry.vehicle.plate}`
    : "Waterblaster";
  const driverName = entry.driver?.full_name ?? "A driver";
  const missingText = missing.join(", ").replace(/, ([^,]*)$/, " and $1");

  const result = await sendEmail({
    to,
    fromName: "Platinum Painters Fleet",
    subject: `Fuel entry missing ${missingText} — ${driverName}`,
    text:
      `${driverName} logged a fuel entry for ${vehicleName} on ${entry.fuelled_on} ` +
      `without the ${missingText}.\n\n` +
      `Fill it in from the receipt photo under Fleet → Fuel Log:\n${origin}/fleet/fuel\n`,
  });

  // The entry itself is already saved and flagged in the Fuel Log either
  // way - a failed email shouldn't show the driver an error.
  return result.sent ? {} : { emailError: result.reason };
}
