import { ImageOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, fmtKm, fmtMoney } from "@/lib/fleet/format";

type FuelRow = {
  id: string;
  odometer_km: number;
  litres: number;
  cost_total: number;
  cost_per_litre: number;
  gps_lat: number | null;
  gps_lng: number | null;
  created_at: string;
  receipt_photo_path: string;
  odometer_photo_path: string;
  vehicle: { plate: string; make: string; model: string } | null;
  driver: { full_name: string } | null;
};

export default async function FuelLogPage() {
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("fuel_entries")
    .select(
      "id, odometer_km, litres, cost_total, cost_per_litre, gps_lat, gps_lng, created_at, receipt_photo_path, odometer_photo_path, vehicle:vehicles(plate, make, model), driver:profiles(full_name)"
    )
    .order("created_at", { ascending: false })
    .returns<FuelRow[]>();

  const rows = entries ?? [];

  const withUrls = await Promise.all(
    rows.map(async (r) => {
      const [receipt, odometer] = await Promise.all([
        supabase.storage.from("fleet-photos").createSignedUrl(r.receipt_photo_path, 3600),
        supabase.storage.from("fleet-photos").createSignedUrl(r.odometer_photo_path, 3600),
      ]);
      return {
        ...r,
        receiptUrl: receipt.data?.signedUrl ?? null,
        odometerUrl: odometer.data?.signedUrl ?? null,
      };
    })
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Fuel Log</h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length} entr{rows.length === 1 ? "y" : "ies"} logged by drivers
        </p>
      </div>

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
              </tr>
            </thead>
            <tbody>
              {withUrls.map((r) => {
                const v = r.vehicle;
                return (
                  <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-background">
                    <td className="whitespace-nowrap px-5 py-3">{fmtDateTime(r.created_at)}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {v ? `${v.make} ${v.model} — ${v.plate}` : "Unknown"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">{r.driver?.full_name ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3">{fmtKm(r.odometer_km)}</td>
                    <td className="whitespace-nowrap px-5 py-3">{Number(r.litres).toFixed(2)} L</td>
                    <td className="whitespace-nowrap px-5 py-3">{fmtMoney(r.cost_total)}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      ${Number(r.cost_per_litre).toFixed(2)}
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
                        <PhotoLink href={r.receiptUrl} label="Receipt" />
                        <PhotoLink href={r.odometerUrl} label="Odometer" />
                      </div>
                    </td>
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
