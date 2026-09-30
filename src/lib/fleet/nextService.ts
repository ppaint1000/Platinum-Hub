// When each vehicle's next service is due, by km. Vehicles are serviced
// every SERVICE_INTERVAL_KM: the next one is due at the last service's
// odometer plus that - unless the service record says otherwise (its
// "Next due (km)"). With no service logged yet, the vehicle's own "Next
// service due (km)" (vehicles.next_service_km) is used instead.

export const SERVICE_INTERVAL_KM = 10000;
// Flag it this far out.
export const SERVICE_SOON_KM = 1000;

type ServiceLike = { vehicle_id: string; date: string; odometer_km: number | null; next_due_odometer_km: number | null };
type FuelLike = { vehicle_id: string | null; odometer_km: number | null };

export type NextService = {
  currentKm: number | null;
  dueAtKm: number | null;
  kmLeft: number | null;
  lastServiceDate: string | null;
  status: "overdue" | "soon" | "ok" | "unknown";
};

// The vehicle's odometer now: the newer of its recorded reading and its
// latest fill-up (drivers' receipts keep it more up to date).
export function currentOdometer(vehicle: { id: string; current_odometer_km: number | null }, fuel: FuelLike[]): number | null {
  const readings = fuel
    .filter((f) => f.vehicle_id === vehicle.id && f.odometer_km != null)
    .map((f) => Number(f.odometer_km));
  if (vehicle.current_odometer_km != null) readings.push(Number(vehicle.current_odometer_km));
  return readings.length ? Math.max(...readings) : null;
}

export function nextServiceFor(
  vehicle: { id: string; current_odometer_km: number | null; next_service_km?: number | null },
  services: ServiceLike[],
  fuel: FuelLike[]
): NextService {
  const currentKm = currentOdometer(vehicle, fuel);
  // The most recent service that has a km reading to count from.
  const last = services
    .filter((s) => s.vehicle_id === vehicle.id && (s.next_due_odometer_km != null || s.odometer_km != null))
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  const dueAtKm = last
    ? last.next_due_odometer_km != null
      ? Number(last.next_due_odometer_km)
      : Number(last.odometer_km) + SERVICE_INTERVAL_KM
    : vehicle.next_service_km != null
      ? Number(vehicle.next_service_km)
      : null;
  const kmLeft = dueAtKm !== null && currentKm !== null ? dueAtKm - currentKm : null;

  return {
    currentKm,
    dueAtKm,
    kmLeft,
    lastServiceDate: last?.date ?? null,
    status: kmLeft === null ? "unknown" : kmLeft < 0 ? "overdue" : kmLeft <= SERVICE_SOON_KM ? "soon" : "ok",
  };
}
