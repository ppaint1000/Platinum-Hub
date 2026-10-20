// Diesels' road user charges (RUC): an email when a vehicle's RUC licence is
// about a week from running out, going by the km it usually does (its fuel-
// log odometer readings - lib/fleet/usage.ts), and another if it runs out.
// Each licence (its paid-to km) is emailed about once per stage, so a
// renewed licence starts fresh. Called from the 7am daily run.
// Vehicles set to "Hubodometer" (the Dynas) go by their hubo instead -
// their paid-to km is a hubo number (lib/fleet/hubodometer.ts).
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/mailer";
import { notificationRecipients } from "@/lib/notifications/recipients";
import { currentOdometer } from "./nextService";
import { fleetUsage } from "./usage";
import { currentHubo, usesHubo } from "./hubodometer";

// Always told, whatever the Notifications settings say.
export const RUC_ALERT_EMAIL = process.env.RUC_ALERT_EMAIL || "shelley@platinumpainters.co.nz";
// NZTA's page for buying road user charges online.
export const RUC_BUY_URL = "https://transact.nzta.govt.nz/v2/purchase-ruc";
// Warn this many days ahead.
export const RUC_WARN_DAYS = 7;
// With no usable average yet, warn at this many km left instead.
const FALLBACK_KM = 1000;
const DAYS_PER_MONTH = 30.44;

type Vehicle = {
  id: string;
  plate: string;
  make: string;
  model: string;
  current_odometer_km: number | null;
  ruc_paid_to_km: number | null;
  ruc_meter?: string | null;
  current_hubodometer_km?: number | null;
};
type Fuel = { vehicle_id: string | null; odometer_km: number | null; hubodometer_km?: number | null; litres: number | null; fuelled_on: string };

export type RucStatus = {
  vehicle: Vehicle;
  // The reading RUC goes by - the odometer, or the hubo for hubo vehicles.
  odometer: number;
  meter: "odometer" | "hubodometer";
  // A hubo carried forward from the odometer since its last reading.
  estimated: boolean;
  kmLeft: number;
  kmPerDay: number | null;
  daysLeft: number | null;
  stage: "due" | "over" | null;
};

const km = (n: number) => `${Math.round(n).toLocaleString("en-NZ")} km`;

export function rucStatus(vehicle: Vehicle, fuel: Fuel[]): RucStatus | null {
  if (vehicle.ruc_paid_to_km == null) return null;
  const odoNow = currentOdometer(vehicle, fuel);
  const hubo = usesHubo(vehicle) ? currentHubo(vehicle, fuel, odoNow) : null;
  const odometer = usesHubo(vehicle) ? (hubo?.km ?? null) : odoNow;
  if (odometer === null) return null;
  const kmLeft = Number(vehicle.ruc_paid_to_km) - odometer;
  const perMonth = fleetUsage([vehicle.id], fuel).vehicles.get(vehicle.id)?.kmPerMonth ?? null;
  // Usage is measured on the odometer; converted to hubo km for hubo vehicles.
  const kmPerDay = perMonth ? (perMonth / DAYS_PER_MONTH) * (hubo?.ratio ?? 1) : null;
  const daysLeft = kmPerDay ? kmLeft / kmPerDay : null;
  const stage = kmLeft <= 0 ? "over" : (daysLeft !== null ? daysLeft <= RUC_WARN_DAYS : kmLeft <= FALLBACK_KM) ? "due" : null;
  return {
    vehicle,
    odometer,
    meter: usesHubo(vehicle) ? "hubodometer" : "odometer",
    estimated: hubo?.estimated ?? false,
    kmLeft,
    kmPerDay,
    daysLeft,
    stage,
  };
}

export async function sendRucAlerts(origin: string): Promise<{ sent: string[] }> {
  const db = createAdminClient();
  const [{ data: vehicles }, { data: fuel }] = await Promise.all([
    db
      .from("vehicles")
      .select("id, plate, make, model, current_odometer_km, ruc_paid_to_km, ruc_meter, current_hubodometer_km")
      .eq("fuel_type", "diesel")
      .not("ruc_paid_to_km", "is", null)
      .returns<Vehicle[]>(),
    db.from("fuel_entries").select("vehicle_id, odometer_km, hubodometer_km, litres, fuelled_on").not("vehicle_id", "is", null).returns<Fuel[]>(),
  ]);

  const sent: string[] = [];
  for (const v of vehicles ?? []) {
    const s = rucStatus(v, fuel ?? []);
    if (!s?.stage) continue;
    const key = `ruc_${s.stage}:${v.id}:${v.ruc_paid_to_km}`;
    const { data: done } = await db.from("hub_alert_log").select("key").eq("key", key).maybeSingle();
    if (done) continue;

    const name = `${v.make} ${v.model} (${v.plate})`;
    const reading = `${s.meter === "hubodometer" ? "Hubodometer" : "Odometer"} now: ${s.estimated ? "about " : ""}${km(s.odometer)}${s.estimated ? " (estimated from the odometer since the last hubo reading)" : ""}.`;
    const status =
      s.stage === "over"
        ? `It has run out - it's ${km(-s.kmLeft)} past the ${km(Number(v.ruc_paid_to_km))} it was paid to.`
        : `It has ${km(s.kmLeft)} left (paid to ${km(Number(v.ruc_paid_to_km))})${s.daysLeft !== null ? ` - about ${Math.max(1, Math.round(s.daysLeft))} day${Math.round(s.daysLeft) === 1 ? "" : "s"} at its usual km` : ""}.`;
    const subject = `Diesel tax is required on vehicle ${v.plate}`;
    const text = [
      `Hi Shelley,`,
      "",
      `Please order another 5000 kms of diesel tax for ${name}.`,
      "",
      `Click the link here to buy more: ${RUC_BUY_URL}`,
      "",
      `${status} ${reading}`,
      `Once it's bought, update "Diesel tax (RUC) paid to (km)" on the vehicle: ${origin}/fleet/vehicles`,
    ].join("\n");
    const html = `<p>Hi Shelley,</p>
<p>Please order another 5000 kms of diesel tax for <strong>${name}</strong>.</p>
<p>Click the link here to buy more: <a href="${RUC_BUY_URL}">${RUC_BUY_URL}</a></p>
<p style="color:#5B6472">${status} ${reading}<br>Once it's bought, update <strong>Diesel tax (RUC) paid to (km)</strong> on the vehicle in the Hub: <a href="${origin}/fleet/vehicles">Fleet → Vehicles</a>.</p>`;

    let extra: string[] = [];
    try {
      extra = await notificationRecipients("fleet_ruc_due");
    } catch {
      // Still goes to the fixed address.
    }
    const to = [...new Map([RUC_ALERT_EMAIL, ...extra].map((e) => [e.toLowerCase(), e])).values()].join(", ");
    const r = await sendEmail({ to, subject, text, html, fromName: "The Hub" });
    if (r.sent) {
      await db.from("hub_alert_log").upsert({ key, detail: subject }, { onConflict: "key", ignoreDuplicates: true });
      sent.push(v.plate);
    }
  }
  return { sent };
}
