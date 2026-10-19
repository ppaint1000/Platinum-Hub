// A fuel entry can be saved without its numbers (e.g. an unreadable
// receipt) - admins are alerted and fill them in later. Waterblaster
// entries have no odometer, so mileage is never "missing" for them.
// Vehicles whose RUC goes by a hubodometer also need its reading - pass
// their ruc_meter (on the entry's vehicle) along with hubodometer_km.
export function missingFuelNumbers(entry: {
  equipment: string | null;
  odometer_km: number | null;
  hubodometer_km?: number | null;
  litres: number | null;
  cost_total: number | null;
  vehicle?: { ruc_meter?: string | null } | null;
}): string[] {
  const missing: string[] = [];
  if (!entry.equipment && entry.odometer_km == null) missing.push("mileage");
  if (!entry.equipment && entry.vehicle?.ruc_meter === "hubodometer" && entry.hubodometer_km == null)
    missing.push("hubodometer");
  if (entry.litres == null) missing.push("litres");
  if (entry.cost_total == null) missing.push("cost");
  return missing;
}
