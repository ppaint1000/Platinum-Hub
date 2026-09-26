"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { missingFuelNumbers } from "@/lib/fleet/missingNumbers";
import { fillUpsForVehicle, totalsFor, type FuelEntryInput } from "@/lib/fleet/fuelEconomy";

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

  const to = await activeAdminEmails(admin);
  if (!to) return {};

  const origin = await hubOrigin();
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

// How far a fill-up's cost per km can stray from the vehicle's own recent
// average before admins are emailed - either way: higher can mean fuel
// going elsewhere or a fault; lower usually means a wrong odometer
// reading or a missed fill-up.
const ECONOMY_ALERT_THRESHOLD = 0.1;
// Fewer earlier fill-ups than this and the "average" is too thin to judge.
const MIN_FILLS_FOR_AVERAGE = 3;

// Called after a fuel entry is saved (driver form) or saved/edited (admin
// Fuel Log form). Compares the fill-up that entry completes against the
// same vehicle's average over its previous fill-ups in the 12 months
// before it (Fleet → Fuel Report's maths, lib/fleet/fuelEconomy.ts), and
// emails every active admin if it's more than 10% off either way.
export async function checkFuelEconomyAction(entryId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const admin = createAdminClient();
  const { data: entry } = await admin
    .from("fuel_entries")
    .select("id, driver_id, vehicle_id, vehicle:vehicles(plate, make, model), driver:profiles(full_name)")
    .eq("id", entryId)
    .single<{
      id: string;
      driver_id: string;
      vehicle_id: string | null;
      vehicle: { plate: string; make: string; model: string } | null;
      driver: { full_name: string } | null;
    }>();
  if (!entry) return { error: "Entry not found." };

  // Only the driver who logged it, or an admin, can trigger the check.
  if (entry.driver_id !== user.id) {
    const { data: me } = await admin.from("profiles").select("role").eq("id", user.id).single();
    if (me?.role !== "admin") return { error: "Entry not found." };
  }
  if (!entry.vehicle_id) return {}; // waterblaster - no km to measure

  const { data: history } = await admin
    .from("fuel_entries")
    .select("id, vehicle_id, fuelled_on, created_at, odometer_km, litres, cost_total")
    .eq("vehicle_id", entry.vehicle_id)
    .returns<FuelEntryInput[]>();
  const fills = fillUpsForVehicle(history ?? []);

  // This entry only completes a fill-up if it has an odometer reading and
  // its whole stretch has costs - otherwise there's nothing to compare yet.
  const index = fills.findIndex((f) => f.id === entryId);
  if (index < 0) return {};
  const fill = fills[index];

  const yearBefore = new Date(fill.fuelledOn + "T00:00:00");
  yearBefore.setFullYear(yearBefore.getFullYear() - 1);
  const since = yearBefore.toISOString().slice(0, 10);
  const earlier = fills.slice(0, index).filter((f) => f.fuelledOn >= since);
  if (earlier.length < MIN_FILLS_FOR_AVERAGE) return {};

  const average = totalsFor(earlier).costPerKm;
  if (average === null || average <= 0) return {};
  const change = (fill.costPerKm - average) / average;
  if (Math.abs(change) <= ECONOMY_ALERT_THRESHOLD) return {};

  const to = await activeAdminEmails(admin);
  if (!to) return {};

  const origin = await hubOrigin();
  const vehicleName = entry.vehicle
    ? `${entry.vehicle.make} ${entry.vehicle.model} — ${entry.vehicle.plate}`
    : "A vehicle";
  const direction = change > 0 ? "higher" : "lower";
  const pct = Math.round(Math.abs(change) * 100);
  const reason =
    change > 0
      ? "It used more fuel per km than usual - worth checking for fuel going elsewhere, a fault, or unusually heavy use."
      : "It used less fuel per km than usual - this usually means a wrong odometer reading or a missed fill-up.";

  const result = await sendEmail({
    to,
    fromName: "Platinum Painters Fleet",
    subject: `Fuel cost per km ${pct}% ${direction} than usual — ${vehicleName}`,
    text:
      `${vehicleName}'s fill-up on ${fill.fuelledOn} (logged by ${entry.driver?.full_name ?? "a driver"}) ` +
      `came to $${fill.costPerKm.toFixed(3)}/km, ${pct}% ${direction} than its average of ` +
      `$${average.toFixed(3)}/km over the ${earlier.length} fill-ups before it.\n\n` +
      `${fill.km.toLocaleString("en-NZ")} km since the previous fill-up, ` +
      `${fill.litres.toFixed(1)} L for $${fill.cost.toFixed(2)}.\n\n` +
      `${reason}\n\n` +
      `Fleet → Fuel Report:\n${origin}/fleet/fuel-report\n`,
  });

  return result.sent ? {} : { emailError: result.reason };
}

async function activeAdminEmails(admin: ReturnType<typeof createAdminClient>) {
  const { data: admins } = await admin
    .from("profiles")
    .select("email")
    .eq("role", "admin")
    .eq("is_active", true)
    .returns<{ email: string | null }[]>();
  return (admins ?? []).map((a) => a.email).filter(Boolean).join(", ");
}

// The Hub's own address, for links in alert emails.
async function hubOrigin() {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}
