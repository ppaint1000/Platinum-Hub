// Each vehicle's average km per month and fuel economy (L/100km), from its
// fuel-log odometer readings over the last 12 months, against the fleet's
// average. A vehicle more than USAGE_TOLERANCE away from the fleet average
// (either way) is flagged.

export const USAGE_TOLERANCE = 0.1; // 10%
const WINDOW_DAYS = 365;
const DAYS_PER_MONTH = 30.44;
// Too short a span gives a silly per-month figure.
const MIN_SPAN_DAYS = 14;

type FuelLike = {
  vehicle_id: string | null;
  odometer_km: number | null;
  litres: number | null;
  fuelled_on: string; // YYYY-MM-DD
};

export type VehicleUsage = {
  vehicleId: string;
  kmPerMonth: number | null;
  lPer100km: number | null;
  fills: number;
};

export type FleetUsage = {
  vehicles: Map<string, VehicleUsage>;
  avgKmPerMonth: number | null;
  avgLPer100km: number | null;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function fleetUsage(vehicleIds: string[], fuel: FuelLike[], today = new Date()): FleetUsage {
  const since = new Date(today.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const vehicles = new Map<string, VehicleUsage>();

  for (const id of vehicleIds) {
    const fills = fuel
      .filter((f) => f.vehicle_id === id && f.odometer_km != null && f.fuelled_on >= since)
      .sort((a, b) => Number(a.odometer_km) - Number(b.odometer_km));

    let kmPerMonth: number | null = null;
    let lPer100km: number | null = null;
    if (fills.length >= 2) {
      const first = fills[0];
      const last = fills[fills.length - 1];
      const km = Number(last.odometer_km) - Number(first.odometer_km);
      const dates = fills.map((f) => Date.parse(f.fuelled_on));
      const spanDays = (Math.max(...dates) - Math.min(...dates)) / 86_400_000;
      if (km > 0 && spanDays >= MIN_SPAN_DAYS) kmPerMonth = km / (spanDays / DAYS_PER_MONTH);

      // Fuel put in after the first fill-up covers the km driven since it.
      let litres = 0;
      let measuredKm = 0;
      for (let i = 1; i < fills.length; i++) {
        const step = Number(fills[i].odometer_km) - Number(fills[i - 1].odometer_km);
        if (step > 0 && fills[i].litres != null) {
          measuredKm += step;
          litres += Number(fills[i].litres);
        }
      }
      if (measuredKm > 0) lPer100km = (litres / measuredKm) * 100;
    }
    vehicles.set(id, { vehicleId: id, kmPerMonth, lPer100km, fills: fills.length });
  }

  const all = [...vehicles.values()];
  return {
    vehicles,
    avgKmPerMonth: mean(all.map((v) => v.kmPerMonth).filter((n): n is number => n !== null)),
    avgLPer100km: mean(all.map((v) => v.lPer100km).filter((n): n is number => n !== null)),
  };
}

// How far from the average (0.12 = 12% over, -0.2 = 20% under).
export function offAverage(value: number | null, average: number | null): number | null {
  if (value === null || average === null || average === 0) return null;
  return value / average - 1;
}

export const isOutside = (off: number | null) => off !== null && Math.abs(off) > USAGE_TOLERANCE;
