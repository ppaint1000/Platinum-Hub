// A vehicle fill-up where some of the fuel went into the water blaster:
// saved as two fuel entries from the one receipt - the vehicle's share (so
// its litres and cost per km stay right) and a waterblaster entry charged to
// a job (fleet_waterblaster_fuel.sql's trigger adds it to the job's costs).
// The cost is split at the receipt's price per litre.

export type FuelSplit = {
  vehicleLitres: number;
  vehicleCost: number | null;
  waterblasterLitres: number;
  waterblasterCost: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function splitWaterblasterFuel(totalLitres: number, totalCost: number | null, waterblasterLitres: number): FuelSplit {
  const waterblasterCost = totalCost === null ? null : round2((totalCost * waterblasterLitres) / totalLitres);
  return {
    vehicleLitres: round2(totalLitres - waterblasterLitres),
    // Whatever's left, so the two always add back up to the receipt.
    vehicleCost: totalCost === null || waterblasterCost === null ? null : round2(totalCost - waterblasterCost),
    waterblasterLitres,
    waterblasterCost,
  };
}

// Checks the water blaster litres against the fill-up; an error message, or null if fine.
export function waterblasterSplitError(
  totalLitres: string,
  waterblasterLitres: string,
  jobId: string
): string | null {
  const wb = Number(waterblasterLitres);
  if (!waterblasterLitres || !(wb > 0)) return "Enter how many litres went into the water blaster.";
  if (!totalLitres || !(Number(totalLitres) > 0))
    return "Enter the total litres from the receipt, so the water blaster fuel can be taken off the vehicle.";
  if (wb >= Number(totalLitres)) return "The water blaster litres must be less than the total litres.";
  if (!jobId) return "Choose the job site the water blaster fuel was for.";
  return null;
}
