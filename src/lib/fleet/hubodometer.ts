// Hubodometers: diesels whose road user charges (RUC) are measured by a
// hubo on the wheel hub rather than the dashboard odometer (the Toyota
// Dynas). Vehicles → "RUC measured by" sets which. Fill-ups on those
// vehicles record both readings (fleet_hubodometer.sql); this links them:
//
// - ratio: hubo km per odometer km, from fill-ups that have both. Tyre
//   size and wear make them drift apart, so it's measured, not assumed 1.
// - current hubo: the latest hubo reading, carried forward by the odometer
//   km since (× the ratio) when later fill-ups only have the odometer -
//   marked as an estimate.
// - expected hubo: what the next reading should roughly be, for the fuel
//   forms to warn on a likely typo.
//
// A replaced hubo just shows up as a newer, lower reading: the latest by
// date wins, and the backwards step is left out of the ratio.

export type RucMeter = "odometer" | "hubodometer";

export const usesHubo = (v: { ruc_meter?: string | null }) => v.ruc_meter === "hubodometer";

// Recent paired readings only - the ratio drifts with tyres.
const RATIO_STEPS = 10;
// Below this much odometer travel the ratio is too noisy to trust.
const MIN_RATIO_KM = 200;
// A hubo this far off what the odometer says it should be gets a warning:
// whichever is bigger of this share of the distance travelled or the flat km.
export const HUBO_WARN_SHARE = 0.15;
export const HUBO_WARN_KM = 100;

type HuboFuel = {
  vehicle_id: string | null;
  odometer_km: number | null;
  hubodometer_km?: number | null;
  fuelled_on: string;
};
type HuboVehicle = {
  id: string;
  current_odometer_km: number | null;
  current_hubodometer_km?: number | null;
};

type Reading = { date: string; odo: number | null; hubo: number | null };

function readingsFor(vehicleId: string, fuel: HuboFuel[]): Reading[] {
  return fuel
    .filter((f) => f.vehicle_id === vehicleId)
    .map((f) => ({
      date: f.fuelled_on,
      odo: f.odometer_km != null ? Number(f.odometer_km) : null,
      hubo: f.hubodometer_km != null ? Number(f.hubodometer_km) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.odo ?? 0) - (b.odo ?? 0));
}

// Hubo km per odometer km, or null when there isn't enough to go on.
export function hubRatio(vehicle: HuboVehicle, fuel: HuboFuel[]): number | null {
  const paired = readingsFor(vehicle.id, fuel).filter((r) => r.odo !== null && r.hubo !== null);
  let odoKm = 0;
  let huboKm = 0;
  let steps = 0;
  for (let i = paired.length - 1; i > 0 && steps < RATIO_STEPS; i--) {
    const dOdo = paired[i].odo! - paired[i - 1].odo!;
    const dHubo = paired[i].hubo! - paired[i - 1].hubo!;
    // Skips a replaced hubo (goes backwards) or a bad reading.
    if (dOdo <= 0 || dHubo <= 0) continue;
    odoKm += dOdo;
    huboKm += dHubo;
    steps++;
  }
  if (odoKm < MIN_RATIO_KM) return null;
  const ratio = huboKm / odoKm;
  // Anything wildly off 1 is bad data, not tyres.
  return ratio > 0.7 && ratio < 1.3 ? ratio : null;
}

// The last hubo reading and the odometer it was taken at.
function lastHubo(vehicle: HuboVehicle, fuel: HuboFuel[]): { hubo: number; odo: number | null; date: string | null } | null {
  const withHubo = readingsFor(vehicle.id, fuel).filter((r) => r.hubo !== null);
  const last = withHubo[withHubo.length - 1];
  if (last) return { hubo: last.hubo!, odo: last.odo, date: last.date };
  if (vehicle.current_hubodometer_km != null) {
    return {
      hubo: Number(vehicle.current_hubodometer_km),
      odo: vehicle.current_odometer_km != null ? Number(vehicle.current_odometer_km) : null,
      date: null,
    };
  }
  return null;
}

export type HuboNow = { km: number; estimated: boolean; ratio: number | null };

// The hubo now. odometerNow is the vehicle's current odometer
// (nextService.currentOdometer) - anything it's moved past the odometer at
// the last hubo reading is added on, converted by the ratio.
export function currentHubo(vehicle: HuboVehicle, fuel: HuboFuel[], odometerNow: number | null): HuboNow | null {
  const last = lastHubo(vehicle, fuel);
  if (!last) return null;
  const ratio = hubRatio(vehicle, fuel);
  if (odometerNow === null || last.odo === null || odometerNow <= last.odo) {
    return { km: last.hubo, estimated: false, ratio };
  }
  return { km: last.hubo + (odometerNow - last.odo) * (ratio ?? 1), estimated: true, ratio };
}

// What the fuel forms need to check a new reading against.
export type HuboHint = { lastHubo: number; lastOdo: number | null; ratio: number | null };

export function huboHint(vehicle: HuboVehicle, fuel: HuboFuel[]): HuboHint | null {
  const last = lastHubo(vehicle, fuel);
  if (!last) return null;
  return { lastHubo: last.hubo, lastOdo: last.odo, ratio: hubRatio(vehicle, fuel) };
}

// The hubo a fill-up at this odometer should roughly show, or null.
export function expectedHubo(hint: HuboHint | null | undefined, odometer: number | null): number | null {
  if (!hint || hint.lastOdo === null || odometer === null || odometer < hint.lastOdo) return null;
  return Math.round(hint.lastHubo + (odometer - hint.lastOdo) * (hint.ratio ?? 1));
}

// A warning for the person entering it, or null if the reading looks right.
export function huboWarning(hint: HuboHint | null | undefined, odometer: number | null, hubo: number | null): string | null {
  if (!hint || hubo === null) return null;
  const fmt = (n: number) => `${Math.round(n).toLocaleString("en-NZ")} km`;
  if (hubo < hint.lastHubo) {
    return `That's lower than the last hubodometer reading (${fmt(hint.lastHubo)}). Check it - or if the hubo has been replaced, that's fine.`;
  }
  const expected = expectedHubo(hint, odometer);
  if (expected === null || odometer === null || hint.lastOdo === null) return null;
  const travelled = odometer - hint.lastOdo;
  const allowed = Math.max(travelled * HUBO_WARN_SHARE, HUBO_WARN_KM);
  if (Math.abs(hubo - expected) <= allowed) return null;
  return `The odometer says the hubodometer should be about ${fmt(expected)}. Check both readings.`;
}
