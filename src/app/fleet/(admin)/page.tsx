import { Fuel, Wrench, Gauge, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, fmtDate, fmtMoney } from "@/lib/fleet/format";

type Vehicle = {
  id: string;
  plate: string;
  make: string;
  model: string;
  wof_expiry: string | null;
  rego_expiry: string | null;
};

type FuelEntry = {
  id: string;
  vehicle_id: string;
  litres: number;
  cost_total: number;
  odometer_km: number;
  created_at: string;
  vehicle: { plate: string; make: string; model: string } | null;
};

type ServiceRecord = {
  id: string;
  vehicle_id: string;
  date: string;
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
        .select("id, plate, make, model, wof_expiry, rego_expiry")
        .returns<Vehicle[]>(),
      supabase
        .from("fuel_entries")
        .select(
          "id, vehicle_id, litres, cost_total, odometer_km, created_at, vehicle:vehicles(plate, make, model)"
        )
        .order("created_at", { ascending: false })
        .returns<FuelEntry[]>(),
      supabase
        .from("service_records")
        .select(
          "id, vehicle_id, date, type, description, next_due_date, created_at, vehicle:vehicles(plate, make, model)"
        )
        .order("created_at", { ascending: false })
        .returns<ServiceRecord[]>(),
    ]);

  const vList = vehicles ?? [];
  const fList = fuelEntries ?? [];
  const sList = (serviceRecords ?? []).map((r: any) => ({ ...r, vehicle: Array.isArray(r.vehicle) ? r.vehicle[0] ?? null : r.vehicle, }));

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthEntries = fList.filter((f) => f.created_at.slice(0, 7) === thisMonth);
  const monthSpend = monthEntries.reduce((s, f) => s + Number(f.cost_total), 0);

  type Alert = { severity: "warn" | "critical"; title: string; sub: string; days: number };
  const alerts: Alert[] = [];

  for (const v of vList) {
    for (const [field, label] of [
      ["wof_expiry", "WOF"],
      ["rego_expiry", "Rego"],
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
  alerts.sort((a, b) => a.days - b.days);

  // Fleet-wide average economy: pool consecutive-fill deltas per vehicle.
  const byVehicle = new Map<string, FuelEntry[]>();
  for (const f of fList) {
    if (!byVehicle.has(f.vehicle_id)) byVehicle.set(f.vehicle_id, []);
    byVehicle.get(f.vehicle_id)!.push(f);
  }
  const economies: number[] = [];
  for (const logs of byVehicle.values()) {
    const sorted = [...logs].sort((a, b) => a.odometer_km - b.odometer_km);
    let totalKm = 0;
    let totalL = 0;
    for (let i = 1; i < sorted.length; i++) {
      const km = sorted[i].odometer_km - sorted[i - 1].odometer_km;
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
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Overview of the fleet, at a glance</p>
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

      <div className="mt-6 rounded-xl border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Needs attention</h2>
        </div>
        {alerts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            Nothing due in the next 30 days.
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
              const vName = v ? `${v.make} ${v.model} — ${v.plate}` : "Unknown vehicle";
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
                        {Number((a.rec as FuelEntry).litres).toFixed(1)} L for{" "}
                        {fmtMoney((a.rec as FuelEntry).cost_total)}
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
