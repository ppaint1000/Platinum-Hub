import { AlertTriangle, ImageOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtKm, fmtMoney } from "@/lib/fleet/format";
import { AddFuelEntryButton, EditFuelEntryButton } from "@/components/fleet/AddFuelEntryButton";
import { missingFuelNumbers } from "@/lib/fleet/missingNumbers";

type FuelRow = {
  id: string;
  driver_id: string;
  vehicle_id: string | null;
  equipment: string | null;
  job_id: string | null;
  odometer_km: number | null;
  litres: number | null;
  cost_total: number | null;
  cost_per_litre: number | null;
  gps_lat: number | null;
  gps_lng: number | null;
  created_at: string;
  fuelled_on: string;
  receipt_photo_path: string | null;
  odometer_photo_path: string | null;
  vehicle: { plate: string; make: string; model: string } | null;
  driver: { full_name: string } | null;
};

type VehicleRow = { id: string; plate: string; make: string; model: string; assigned_driver_id: string | null };
type JobRow = { id: string; job_number: string | null; name: string; client: { name: string } | null };

export default async function FuelLogPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();
  const isAdmin = profile?.role === "admin";

  // Only needed for the admin "Add entry" form.
  const [{ data: drivers }, { data: vehicles }, { data: jobs }] = isAdmin
    ? await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name")
          .eq("is_active", true)
          .order("full_name")
          .returns<{ id: string; full_name: string }[]>(),
        supabase
          .from("vehicles")
          .select("id, plate, make, model, assigned_driver_id")
          .order("plate")
          .returns<VehicleRow[]>(),
        supabase
          .from("jobs")
          .select("id, job_number, name, client:clients(name)")
          .in("status", ["won", "in_progress"])
          .order("name")
          .returns<JobRow[]>(),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const { data: entries } = await supabase
    .from("fuel_entries")
    .select(
      "id, driver_id, vehicle_id, equipment, job_id, odometer_km, litres, cost_total, cost_per_litre, gps_lat, gps_lng, created_at, fuelled_on, receipt_photo_path, odometer_photo_path, vehicle:vehicles(plate, make, model), driver:profiles(full_name)"
    )
    .order("fuelled_on", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<FuelRow[]>();

  const rows = entries ?? [];

  const withUrls = await Promise.all(
    rows.map(async (r) => {
      const [receipt, odometer] = await Promise.all([
        r.receipt_photo_path
          ? supabase.storage.from("fleet-photos").createSignedUrl(r.receipt_photo_path, 3600)
          : Promise.resolve({ data: null }),
        r.odometer_photo_path
          ? supabase.storage.from("fleet-photos").createSignedUrl(r.odometer_photo_path, 3600)
          : Promise.resolve({ data: null }),
      ]);
      return {
        ...r,
        receiptUrl: receipt.data?.signedUrl ?? null,
        odometerUrl: odometer.data?.signedUrl ?? null,
      };
    })
  );

  const driverOptions = (drivers ?? []).map((d) => ({ id: d.id, label: d.full_name }));
  const jobOptions = (jobs ?? []).map((j) => ({
    id: j.id,
    label: [j.job_number, j.name, j.client?.name].filter(Boolean).join(" — "),
  }));
  const incompleteCount = rows.filter((r) => missingFuelNumbers(r).length > 0).length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Fuel Log</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length} entr{rows.length === 1 ? "y" : "ies"} logged
          </p>
        </div>
        {isAdmin && (
          <AddFuelEntryButton drivers={driverOptions} vehicles={vehicles ?? []} jobs={jobOptions} />
        )}
      </div>

      {incompleteCount > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-none" />
          {incompleteCount} {incompleteCount === 1 ? "entry is" : "entries are"} missing numbers the driver
          couldn&apos;t enter — fill {incompleteCount === 1 ? "it" : "them"} in from the receipt photo
          {isAdmin ? " using the edit button" : ""}.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {withUrls.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No fuel entries yet — they&apos;ll show up here as soon as drivers log one.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Vehicle</th>
                <th className="px-5 py-3">Driver</th>
                <th className="px-5 py-3">Odometer</th>
                <th className="px-5 py-3">Litres</th>
                <th className="px-5 py-3">Cost</th>
                <th className="px-5 py-3">$/L</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Photos</th>
                {isAdmin && <th className="px-3 py-3" />}
              </tr>
            </thead>
            <tbody>
              {withUrls.map((r) => {
                const v = r.vehicle;
                const missing = missingFuelNumbers(r);
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-border last:border-b-0 ${
                      missing.length > 0 ? "bg-amber-50/60 hover:bg-amber-50" : "hover:bg-background"
                    }`}
                  >
                    <td className="whitespace-nowrap px-5 py-3">
                      {fmtDate(r.fuelled_on)}
                      {missing.length > 0 && (
                        <span className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
                          <AlertTriangle className="h-3 w-3" />
                          Missing {missing.join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {v ? `${v.make} ${v.model} — ${v.plate}` : "Waterblaster"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">{r.driver?.full_name ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3">{fmtKm(r.odometer_km)}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {r.litres != null ? `${Number(r.litres).toFixed(2)} L` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {r.cost_total != null ? fmtMoney(r.cost_total) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {r.cost_per_litre != null ? `${Number(r.cost_per_litre).toFixed(2)}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {r.gps_lat && r.gps_lng ? (
                        <a
                          href={`https://www.google.com/maps?q=${r.gps_lat},${r.gps_lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-red-dark underline underline-offset-2"
                        >
                          View map
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <div className="flex gap-2">
                        {r.receipt_photo_path && <PhotoLink href={r.receiptUrl} label="Receipt" />}
                        {!r.receipt_photo_path && !r.odometer_photo_path && <span className="text-xs text-muted">—</span>}
                        {r.odometer_photo_path && <PhotoLink href={r.odometerUrl} label="Odometer" />}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-3">
                        <EditFuelEntryButton
                          entry={r}
                          drivers={driverOptions}
                          vehicles={vehicles ?? []}
                          jobs={jobOptions}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function PhotoLink({ href, label }: { href: string | null; label: string }) {
  if (!href) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted">
        <ImageOff className="h-3.5 w-3.5" />
        {label}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-medium text-brand-red-dark underline underline-offset-2"
    >
      {label}
    </a>
  );
}
