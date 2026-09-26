// A fuel entry can be saved without its numbers (e.g. an unreadable
// receipt) - admins are alerted and fill them in later. Waterblaster
// entries have no odometer, so mileage is never "missing" for them.
export function missingFuelNumbers(entry: {
  equipment: string | null;
  odometer_km: number | null;
  litres: number | null;
  cost_total: number | null;
}): string[] {
  const missing: string[] = [];
  if (!entry.equipment && entry.odometer_km == null) missing.push("mileage");
  if (entry.litres == null) missing.push("litres");
  if (entry.cost_total == null) missing.push("cost");
  return missing;
}
