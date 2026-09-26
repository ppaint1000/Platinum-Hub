// Per-vehicle fuel economy for Fleet → Fuel Report, using the "full tank
// to full tank" method: fuel bought at a fill-up replaces what was burned
// since the previous fill-up, so each fill-up's cost is charged against
// the km driven since the one before it.
//
// - The first odometer reading on record only starts the chain - there's
//   no earlier reading to measure km from, so its fuel isn't counted.
// - A fill-up with no odometer reading (saved with missing numbers) still
//   bought fuel: its litres/cost roll into the next fill-up that has one.
// - If any fill-up in a stretch is missing its litres or cost, that whole
//   stretch is left out rather than guessed at.

export type FuelEntryInput = {
  id: string;
  vehicle_id: string | null;
  fuelled_on: string;
  created_at: string;
  odometer_km: number | null;
  litres: number | null;
  cost_total: number | null;
};

export type FillUp = {
  id: string;
  fuelledOn: string;
  odometerKm: number;
  km: number;
  litres: number;
  cost: number;
  costPerKm: number;
  litresPer100Km: number;
};

export type Totals = {
  km: number;
  litres: number;
  cost: number;
  fills: number;
  costPerKm: number | null;
  litresPer100Km: number | null;
};

export function fillUpsForVehicle(entries: FuelEntryInput[]): FillUp[] {
  const ordered = [...entries].sort(
    (a, b) => a.fuelled_on.localeCompare(b.fuelled_on) || a.created_at.localeCompare(b.created_at)
  );

  const fills: FillUp[] = [];
  let prevOdometer: number | null = null;
  let litres = 0;
  let cost = 0;
  let complete = true;

  for (const e of ordered) {
    if (e.litres == null || e.cost_total == null) complete = false;
    litres += Number(e.litres ?? 0);
    cost += Number(e.cost_total ?? 0);

    if (e.odometer_km == null) continue;

    const km = prevOdometer !== null ? e.odometer_km - prevOdometer : 0;
    if (prevOdometer !== null && km > 0 && complete && cost > 0) {
      fills.push({
        id: e.id,
        fuelledOn: e.fuelled_on,
        odometerKm: e.odometer_km,
        km,
        litres,
        cost,
        costPerKm: cost / km,
        litresPer100Km: (litres / km) * 100,
      });
    }
    // A reading lower than the last one is a typo either way - take it as
    // the new starting point rather than carrying a negative stretch.
    prevOdometer = e.odometer_km;
    litres = 0;
    cost = 0;
    complete = true;
  }

  return fills;
}

export function totalsFor(fills: FillUp[]): Totals {
  const km = fills.reduce((s, f) => s + f.km, 0);
  const litres = fills.reduce((s, f) => s + f.litres, 0);
  const cost = fills.reduce((s, f) => s + f.cost, 0);
  return {
    km,
    litres,
    cost,
    fills: fills.length,
    costPerKm: km > 0 ? cost / km : null,
    litresPer100Km: km > 0 ? (litres / km) * 100 : null,
  };
}
