import Link from "next/link";
import { BarChart3, Fuel, Wrench, Gauge, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, fmtDate, fmtMoney } from "@/lib/fleet/format";
import { missingFuelNumbers } from "@/lib/fleet/missingNumbers";
import { SERVICE_INTERVAL_KM, nextServiceFor, type NextService } from "@/lib/fleet/nextService";

type Vehicle = {
  id: string;
  plate: string;
  make: string;
  model: string;
  wof_expiry: string | null;
  rego_expiry: string | null;
  current_odometer_km: number | null;
  next_service_km: number | null;
  next_service_date: string | null;
};

type FuelEntry = {
  id: string;
  vehicle_id: string | null;
  equipment: string | null;
  litres: number | null;
  cost_total: number | null;
  odometer_km: number | null;
  created_at: string;
  fuelled_on: string;
  vehicle: { plate: string; make: string; model: string } | null;
};

type ServiceRecord = {
  id: string;
  vehicle_id: string;
  date: string;
  odometer_km: number | null;
  next_due_odometer_km: number | null;
  type: string | null;
  description: string | null;
  next_due_date: string | null;
  created_at: string;
  vehicle: { plate: string; make: string; model: string } | null;
};

export default async function FleetDashboardPage() {
  const supabase = await createClient();

  const [{ data: vehicles }, { data: fuelEntries }, { data: serviceRecords }] =
    await Promise.all([
      supabase
        .from("vehicles")
        .select("id, plate, make, model, wof_expiry, rego_expiry, current_odometer_km, next_service_km, next_service_date")
        .returns<Vehicle[]>(),
      supabase
        .from("fuel_entries")
        .select(
          "id, vehicle_id, equipment, litres, cost_total, odometer_km, created_at, fuelled_on, vehicle:vehicles(plate, make, model)"
        )
        .order("created_at", { ascending: false })
        .returns<FuelEntry[]>(),
      supabase
        .from("service_records")
        .select(
          "id, vehicle_id, date, odometer_km, next_due_odometer_km, type, description, next_due_date, created_at, vehicle:vehicles(plate, make, model)"
        )
        .order("created_at", { ascending: false })
        .returns<ServiceRecord[]>(),
    ]);

  const vList = vehicles ?? [];
  const fList = fuelEntries ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
const sList = (serviceRecords ?? []).map((r: any) => ({ ...r, vehicle: Array.isArray(r.vehicle) ? r.vehicle[0] ?? null : r.vehicle, }));

  const thisMonth = new Date().toISOString().slice(0, 7);
  // By the fill-up date, not when it was logged.
  const monthEntries = fList.filter((f) => f.fuelled_on.slice(0, 7) === thisMonth);
  const monthSpend = monthEntries.reduce((s, f) => s + Number(f.cost_total), 0);

  type Alert = { severity: "warn" | "critical"; title: string; sub: string; days: number };
  const alerts: Alert[] = [];

  for (const v of vList) {
    for (const [field, label] of [
      ["wof_expiry", "WOF"],
      ["rego_expiry", "Rego"],
      // Only until a service is logged - then the service record's own
      // next due date takes over (below).
      ...(sList.some((s) => s.vehicle_id === v.id) ? [] : ([["next_service_date", "Service due"]] as const)),
    ] as const) {
      const days = daysUntil(v[field]);
      if (days !== null && days <= 30) {
        alerts.push({
          severity: days < 0 ? "critical" : "warn",
          title: `${v.make} ${v.model} — ${v.plate} — ${label}`,
          sub:
            (days < 0
              ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`
              : `Due in ${days} day${days === 1 ? "" : "s"}`) +
            ` · ${fmtDate(v[field])}`,
          days,
        });
      }
    }
  }

  for (const s of sList) {
    const days = daysUntil(s.next_due_date);
    if (days !== null && days <= 30) {
      const v = s.vehicle;
      alerts.push({
        severity: days < 0 ? "critical" : "warn",
        title: `${v ? `${v.make} ${v.model} — ${v.plate}` : "Unknown vehicle"} — Service due`,
        sub:
          (days < 0
            ? `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`
            : `Due in ${days} day${days === 1 ? "" : "s"}`) +
          ` · ${fmtDate(s.next_due_date)}`,
        days,
      });
    }
  }
  // Next service by km (SERVICE_INTERVAL_KM on from the last one).
  const services = vList
    .map((v) => ({ vehicle: v, next: nextServiceFor(v, sList, fList) }))
    .sort((a, b) => {
      // Soonest first; vehicles with no service recorded at the end.
      if (a.next.kmLeft === null) return b.next.kmLeft === null ? a.vehicle.plate.localeCompare(b.vehicle.plate) : 1;
      if (b.next.kmLeft === null) return -1;
      return a.next.kmLeft - b.next.kmLeft;
    });
  for (const { vehicle: v, next } of services) {
    if (next.status !== "overdue" && next.status !== "soon") continue;
    const km = Math.abs(next.kmLeft as number).toLocaleString("en-NZ");
    alerts.push({
      severity: next.status === "overdue" ? "critical" : "warn",
      title: `${v.make} ${v.model} — ${v.plate} — Service due`,
      sub: (next.status === "overdue" ? `${km} km overdue` : `${km} km to go`) + ` · due at ${next.dueAtKm!.toLocaleString("en-NZ")} km`,
      // Sorts with the date alerts: overdue first, then the soonest.
      days: next.status === "overdue" ? -1 : 0,
    });
  }

  // Entries a driver saved without their numbers (unreadable receipt) -
  // shown first, since they're waiting on the office rather than a date.
  for (const f of fList) {
    const missing = missingFuelNumbers(f);
    if (missing.length === 0) continue;
    const v = f.vehicle;
    alerts.push({
      severity: "warn",
      title: `${v ? `${v.make} ${v.model} — ${v.plate}` : "Waterblaster"} — Fuel entry missing ${missing.join(", ")}`,
      sub: `Filled up ${fmtDate(f.fuelled_on)} · fill in from the receipt under Fuel Log`,
      days: -Infinity,
    });
  }

  alerts.sort((a, b) => a.days - b.days);

  // Fleet-wide average economy: pool consecutive-fill deltas per vehicle.
  const byVehicle = new Map<string, FuelEntry[]>();
  for (const f of fList) {
    // Waterblaster fill-ups have no vehicle or odometer - nothing to
    // measure economy against.
    if (!f.vehicle_id || f.odometer_km == null || f.litres == null) continue;
    if (!byVehicle.has(f.vehicle_id)) byVehicle.set(f.vehicle_id, []);
    byVehicle.get(f.vehicle_id)!.push(f);
  }
  const economies: number[] = [];
  for (const logs of byVehicle.values()) {
    const sorted = [...logs].sort((a, b) => a.odometer_km! - b.odometer_km!);
    let totalKm = 0;
    let totalL = 0;
    for (let i = 1; i < sorted.length; i++) {
      const km = sorted[i].odometer_km! - sorted[i - 1].odometer_km!;
      if (km > 0) {
        totalKm += km;
        totalL += Number(sorted[i].litres);
      }
    }
    if (totalKm > 0) economies.push((totalL / totalKm) * 100);
  }
  const avgEconomy =
    economies.length > 0 ? economies.reduce((a, b) => a + b, 0) / economies.length : null;

  const activity = [
    ...fList.map((f) => ({ type: "fuel" as const, date: f.created_at, rec: f })),
    ...sList.map((s) => ({ type: "service" as const, date: s.created_at, rec: s })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Overview of the fleet, at a glance</p>
        </div>
        <Link
          href="/fleet/fuel-report"
          className="flex flex-none items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-background"
        >
          <BarChart3 className="h-4 w-4" />
          Fuel report
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Truck} label="Vehicles" value={String(vList.length)} />
        <StatCard
          icon={Gauge}
          label="Needs attention"
          value={String(alerts.length)}
          tone={alerts.length ? "critical" : undefined}
        />
        <StatCard icon={Fuel} label="Fuel spend — this month" value={fmtMoney(monthSpend)} />
        <StatCard
          icon={Wrench}
          label="Avg fleet economy"
          value={avgEconomy !== null ? `${avgEconomy.toFixed(1)} L/100km` : "—"}
        />
      </div>

      <NextServiceSection services={services} />

      <div className="mt-6 rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Needs attention</h2>
        </div>
        {alerts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            Nothing needs attention right now.
          </p>
        ) : (
          <div>
            {alerts.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0"
              >
                <span
                  className={`mt-0.5 h-full min-h-[2rem] w-1 flex-none rounded-full ${
                    a.severity === "critical" ? "bg-brand-red" : "bg-amber-500"
                  }`}
                />
                <div>
                  <p className="text-sm font-medium text-ink">{a.title}</p>
                  <p className="text-xs text-muted">{a.sub}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
        </div>
        {activity.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            No fuel or service entries yet.
          </p>
        ) : (
          <div>
            {activity.map((a) => {
              const v = a.rec.vehicle;
              const vName = v
                ? `${v.make} ${v.model} — ${v.plate}`
                : a.type === "fuel"
                ? "Waterblaster"
                : "Unknown vehicle";
              return (
                <div
                  key={`${a.type}-${a.rec.id}`}
                  className="flex items-center gap-3 border-b border-border px-5 py-3 text-sm last:border-b-0"
                >
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-red/10 text-brand-red-dark">
                    {a.type === "fuel" ? (
                      <Fuel className="h-4 w-4" />
                    ) : (
                      <Wrench className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    {a.type === "fuel" ? (
                      <p>
                        <span className="font-medium text-ink">{vName}</span> refuelled —{" "}
                        {(a.rec as FuelEntry).litres != null && (a.rec as FuelEntry).cost_total != null
                          ? `${Number((a.rec as FuelEntry).litres).toFixed(1)} L for ${fmtMoney((a.rec as FuelEntry).cost_total)}`
                          : "numbers still to be filled in"}
                      </p>
                    ) : (
                      <p>
                        <span className="font-medium text-ink">{vName}</span> —{" "}
                        {(a.rec as ServiceRecord).type ?? "Service"}
                        {(a.rec as ServiceRecord).description
                          ? `: ${(a.rec as ServiceRecord).description}`
                          : ""}
                      </p>
                    )}
                  </div>
                  <span className="flex-none text-xs text-muted">
                    {fmtDate(a.date.slice(0, 10))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: "critical";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className={`mt-2 text-2xl font-semibold ${tone === "critical" ? "text-brand-red" : "text-ink"}`}>
        {value}
      </p>
    </div>
  );
}

const kmFmt = (n: number) => `${n.toLocaleString("en-NZ")} km`;

// Every vehicle's next service by km, soonest first.
function NextServiceSection({ services }: { services: { vehicle: Vehicle; next: NextService }[] }) {
  if (services.length === 0) return null;
  const anyUnknown = services.some((s) => s.next.kmLeft === null);
  return (
    <div className="mt-6 rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-ink">Next service</h2>
        <p className="text-xs text-muted">Every {kmFmt(SERVICE_INTERVAL_KM)}</p>
      </div>
      <ul>
        {services.map(({ vehicle: v, next }) => (
          <li key={v.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-5 py-3 last:border-b-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {v.make} {v.model} — {v.plate}
              </p>
              <p className="text-xs text-muted">
                {next.currentKm !== null ? `Now ${kmFmt(next.currentKm)}` : "No odometer reading yet"}
                {next.dueAtKm !== null && ` · due at ${kmFmt(next.dueAtKm)}`}
              </p>
            </div>
            <KmToGo next={next} />
          </li>
        ))}
      </ul>
      {anyUnknown && (
        <p className="border-t border-border px-5 py-3 text-xs text-muted">
          Set each vehicle&apos;s <span className="font-medium text-ink">Next service due (km)</span> under{" "}
          <Link href="/fleet/vehicles" className="font-medium text-brand-red-dark hover:underline">
            Vehicles
          </Link>
          , or log its last service under{" "}
          <Link href="/fleet/servicing" className="font-medium text-brand-red-dark hover:underline">
            Servicing
          </Link>
          , to see how far it has to go.
        </p>
      )}
    </div>
  );
}

function KmToGo({ next }: { next: NextService }) {
  if (next.kmLeft === null) {
    return (
      <Link
        href="/fleet/vehicles"
        className="flex min-h-10 items-center rounded-lg border border-border px-3 text-xs font-semibold text-muted transition hover:border-brand-red/40 hover:text-ink"
      >
        {next.dueAtKm === null ? "Set next service" : "Needs an odometer reading"}
      </Link>
    );
  }
  const km = kmFmt(Math.abs(next.kmLeft));
  if (next.status === "overdue") {
    return <span className="rounded-full bg-brand-red px-3 py-1 text-sm font-semibold text-white">{km} overdue</span>;
  }
  if (next.status === "soon") {
    return <span className="rounded-full bg-amber-500 px-3 py-1 text-sm font-semibold text-white">{km} to go</span>;
  }
  return <span className="text-sm font-semibold text-ink">{km} to go</span>;
}
