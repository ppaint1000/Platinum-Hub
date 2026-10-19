"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUserRole } from "@/lib/supabase/useUserRole";
import { Modal, Field, inputClass } from "@/components/fleet/Modal";
import { ExpiryChip } from "@/components/fleet/StatusChip";
import { fmtKm } from "@/lib/fleet/format";
import { SERVICE_SOON_KM, type NextService } from "@/lib/fleet/nextService";
import type { HuboNow } from "@/lib/fleet/hubodometer";

// hubo: only for vehicles whose RUC goes by a hubodometer.
export type VehicleStatus = { next: NextService; odometer: number | null; hubo?: HuboNow | null };

// A km-based due point (service, RUC): red when past, amber within 1,000 km.
function KmDueChip({ dueAtKm, kmLeft }: { dueAtKm: number | null; kmLeft: number | null }) {
  if (dueAtKm === null) return <span className="text-muted">—</span>;
  const tone =
    kmLeft === null
      ? "bg-background text-muted"
      : kmLeft < 0
        ? "bg-red-50 text-red-700"
        : kmLeft <= SERVICE_SOON_KM
          ? "bg-amber-50 text-amber-800"
          : "bg-green-50 text-green-800";
  const left =
    kmLeft === null ? "" : kmLeft < 0 ? ` · ${fmtKm(-kmLeft)} over` : ` · ${fmtKm(kmLeft)} to go`;
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>
      {fmtKm(dueAtKm)}
      {left}
    </span>
  );
}

type Vehicle = {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number | null;
  current_odometer_km: number | null;
  assigned_driver_id: string | null;
  wof_expiry: string | null;
  rego_expiry: string | null;
  next_service_km: number | null;
  next_service_date: string | null;
  notes: string | null;
  fuel_type: "petrol" | "diesel" | string;
  // Diesel only: the km the Road User Charges licence runs out at - on the
  // odometer, or on the hubodometer when ruc_meter is "hubodometer".
  ruc_paid_to_km: number | null;
  ruc_meter: "odometer" | "hubodometer" | string;
  current_hubodometer_km: number | null;
};

type Driver = { id: string; full_name: string };

type FormState = {
  plate: string;
  make: string;
  model: string;
  year: string;
  current_odometer_km: string;
  assigned_driver_id: string;
  wof_expiry: string;
  rego_expiry: string;
  next_service_km: string;
  next_service_date: string;
  notes: string;
  fuel_type: "petrol" | "diesel";
  ruc_paid_to_km: string;
  ruc_meter: "odometer" | "hubodometer";
  current_hubodometer_km: string;
};

const EMPTY: FormState = {
  plate: "",
  make: "",
  model: "",
  year: "",
  current_odometer_km: "",
  assigned_driver_id: "",
  wof_expiry: "",
  rego_expiry: "",
  next_service_km: "",
  next_service_date: "",
  notes: "",
  fuel_type: "petrol",
  ruc_paid_to_km: "",
  ruc_meter: "odometer",
  current_hubodometer_km: "",
};

export function VehiclesClient({
  initialVehicles,
  drivers,
  status = {},
}: {
  initialVehicles: Vehicle[];
  drivers: Driver[];
  // Per vehicle id: its next service and current odometer.
  status?: Record<string, VehicleStatus>;
}) {
  const router = useRouter();
  const role = useUserRole();
  const canDelete = role === "admin";
  // Supervisors can view Fleet but only log fuel - adding and editing is
  // admin-only too (also enforced by RLS, see fleet_supervisor_view_only.sql).
  const canEdit = role === "admin";
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const driverName = (id: string | null) => drivers.find((d) => d.id === id)?.full_name ?? "—";

  function openAdd() {
    setForm(EMPTY);
    setError(null);
    setAdding(true);
  }

  function openEdit(v: Vehicle) {
    setForm({
      plate: v.plate,
      make: v.make,
      model: v.model,
      year: v.year?.toString() ?? "",
      current_odometer_km: v.current_odometer_km?.toString() ?? "",
      assigned_driver_id: v.assigned_driver_id ?? "",
      wof_expiry: v.wof_expiry ?? "",
      rego_expiry: v.rego_expiry ?? "",
      next_service_km: v.next_service_km?.toString() ?? "",
      next_service_date: v.next_service_date ?? "",
      notes: v.notes ?? "",
      fuel_type: v.fuel_type === "diesel" ? "diesel" : "petrol",
      ruc_paid_to_km: v.ruc_paid_to_km?.toString() ?? "",
      ruc_meter: v.ruc_meter === "hubodometer" ? "hubodometer" : "odometer",
      current_hubodometer_km: v.current_hubodometer_km?.toString() ?? "",
    });
    setError(null);
    setEditing(v);
  }

  function close() {
    setAdding(false);
    setEditing(null);
  }

  async function save() {
    if (!form.plate.trim()) return setError("Plate is required.");
    if (!form.make.trim()) return setError("Make is required.");
    if (!form.model.trim()) return setError("Model is required.");
    const hubo = form.fuel_type === "diesel" && form.ruc_meter === "hubodometer";
    if (hubo && form.current_hubodometer_km && Number(form.current_hubodometer_km) <= 0)
      return setError("Check the hubodometer reading.");

    setSaving(true);
    setError(null);
    const supabase = createClient();

    const payload = {
      plate: form.plate.trim(),
      make: form.make.trim(),
      model: form.model.trim(),
      year: form.year ? Number(form.year) : null,
      current_odometer_km: form.current_odometer_km ? Number(form.current_odometer_km) : null,
      assigned_driver_id: form.assigned_driver_id || null,
      wof_expiry: form.wof_expiry || null,
      rego_expiry: form.rego_expiry || null,
      next_service_km: form.next_service_km ? Number(form.next_service_km) : null,
      next_service_date: form.next_service_date || null,
      notes: form.notes.trim() || null,
      fuel_type: form.fuel_type,
      // Road User Charges only apply to diesels.
      ruc_paid_to_km: form.fuel_type === "diesel" && form.ruc_paid_to_km ? Number(form.ruc_paid_to_km) : null,
      // Only diesels can be on a hubodometer.
      ruc_meter: hubo ? "hubodometer" : "odometer",
      current_hubodometer_km: hubo && form.current_hubodometer_km ? Number(form.current_hubodometer_km) : null,
    };

    const { error } = editing
      ? await supabase.from("vehicles").update(payload).eq("id", editing.id)
      : await supabase.from("vehicles").insert(payload);

    setSaving(false);
    if (error) return setError("Couldn't save — " + error.message);

    close();
    router.refresh();
  }

  async function remove(v: Vehicle) {
    if (!confirm(`Delete ${v.make} ${v.model} (${v.plate})? This can't be undone.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("vehicles").delete().eq("id", v.id);
    if (error) return alert("Couldn't delete — " + error.message);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Vehicles</h1>
          <p className="mt-1 text-sm text-muted">
            {initialVehicles.length} vehicle{initialVehicles.length === 1 ? "" : "s"} in the fleet
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black"
          >
            <Plus className="h-4 w-4" />
            Add vehicle
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {initialVehicles.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No vehicles yet. Add your first company vehicle to get started.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Vehicle</th>
                <th className="px-5 py-3">Plate</th>
                <th className="px-5 py-3">Driver</th>
                <th className="px-5 py-3">Odometer</th>
                <th className="px-5 py-3">Fuel</th>
                <th className="px-5 py-3">WOF</th>
                <th className="px-5 py-3">Rego</th>
                <th className="px-5 py-3">Next service</th>
                <th className="px-5 py-3">Diesel tax (RUC)</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {initialVehicles.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-b-0 hover:bg-background">
                  <td className="whitespace-nowrap px-5 py-3">
                    {v.year ? `${v.year} ` : ""}
                    {v.make} {v.model}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs">{v.plate}</td>
                  <td className="whitespace-nowrap px-5 py-3">{driverName(v.assigned_driver_id)}</td>
                  <td className="whitespace-nowrap px-5 py-3">{fmtKm(status[v.id]?.odometer ?? v.current_odometer_km)}</td>
                  <td className="whitespace-nowrap px-5 py-3">{v.fuel_type === "diesel" ? "Diesel" : "Petrol"}</td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <ExpiryChip date={v.wof_expiry} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <ExpiryChip date={v.rego_expiry} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <KmDueChip dueAtKm={status[v.id]?.next.dueAtKm ?? null} kmLeft={status[v.id]?.next.kmLeft ?? null} />
                    {v.next_service_date && !status[v.id]?.next.lastServiceDate && (
                      <div className="mt-1">
                        <ExpiryChip date={v.next_service_date} />
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    {v.fuel_type === "diesel" ? (
                      <>
                        <KmDueChip
                          dueAtKm={v.ruc_paid_to_km}
                          kmLeft={(() => {
                            // Hubo vehicles: paid-to is a hubo number.
                            const now =
                              v.ruc_meter === "hubodometer"
                                ? (status[v.id]?.hubo?.km ?? null)
                                : (status[v.id]?.odometer ?? null);
                            return v.ruc_paid_to_km != null && now != null ? Math.round(v.ruc_paid_to_km - now) : null;
                          })()}
                        />
                        {v.ruc_meter === "hubodometer" && (
                          <div className="mt-1 text-xs text-muted">
                            {status[v.id]?.hubo
                              ? `Hubo ${status[v.id]?.hubo?.estimated ? "≈ " : ""}${fmtKm(Math.round(status[v.id]!.hubo!.km))}`
                              : "Hubo — no reading yet"}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <button
                          onClick={() => openEdit(v)}
                          aria-label="Edit"
                          className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-ink"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => remove(v)}
                          aria-label="Delete"
                          className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-brand-red"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(adding || editing) && (
        <Modal
          title={editing ? "Edit vehicle" : "Add vehicle"}
          onClose={close}
          onSave={save}
          saving={saving}
        >
          <Field label="Plate / Rego no." required>
            <input
              className={inputClass}
              value={form.plate}
              onChange={(e) => setForm({ ...form, plate: e.target.value })}
              placeholder="ABC123"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Make" required>
              <input
                className={inputClass}
                value={form.make}
                onChange={(e) => setForm({ ...form, make: e.target.value })}
                placeholder="Toyota"
              />
            </Field>
            <Field label="Model" required>
              <input
                className={inputClass}
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="Hilux"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Year">
              <input
                type="number"
                className={inputClass}
                value={form.year}
                onChange={(e) => setForm({ ...form, year: e.target.value })}
                placeholder="2021"
              />
            </Field>
            <Field label="Odometer (km)">
              <input
                type="number"
                className={inputClass}
                value={form.current_odometer_km}
                onChange={(e) => setForm({ ...form, current_odometer_km: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Fuel">
            <div className="flex gap-5 py-1.5">
              {(["petrol", "diesel"] as const).map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="fuel_type"
                    checked={form.fuel_type === f}
                    onChange={() => setForm({ ...form, fuel_type: f })}
                    className="h-4 w-4"
                  />
                  {f === "petrol" ? "Petrol" : "Diesel"}
                </label>
              ))}
            </div>
          </Field>
          {form.fuel_type === "diesel" && (
            <Field label="RUC measured by">
              <div className="flex gap-5 py-1.5">
                {(["odometer", "hubodometer"] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="ruc_meter"
                      checked={form.ruc_meter === m}
                      onChange={() => setForm({ ...form, ruc_meter: m })}
                      className="h-4 w-4"
                    />
                    {m === "odometer" ? "Odometer" : "Hubodometer"}
                  </label>
                ))}
              </div>
            </Field>
          )}
          {form.fuel_type === "diesel" && form.ruc_meter === "hubodometer" && (
            <Field label="Hubodometer now (km)">
              <input
                type="number"
                inputMode="numeric"
                className={inputClass}
                value={form.current_hubodometer_km}
                onChange={(e) => setForm({ ...form, current_hubodometer_km: e.target.value })}
                placeholder="Reading on the hub - a starting point"
              />
              <p className="mt-1 text-xs text-muted">
                Drivers enter both the odometer and the hubo at each fill-up. Fill-ups keep the hubo up to date from
                then on.
              </p>
            </Field>
          )}
          {form.fuel_type === "diesel" && (
            <Field label={form.ruc_meter === "hubodometer" ? "Diesel tax (RUC) paid to (hubo km)" : "Diesel tax (RUC) paid to (km)"}>
              <input
                type="number"
                inputMode="numeric"
                className={inputClass}
                value={form.ruc_paid_to_km}
                onChange={(e) => setForm({ ...form, ruc_paid_to_km: e.target.value })}
                placeholder="The end km on the RUC licence"
              />
            </Field>
          )}
          <Field label="Assigned driver">
            <select
              className={inputClass}
              value={form.assigned_driver_id}
              onChange={(e) => setForm({ ...form, assigned_driver_id: e.target.value })}
            >
              <option value="">Unassigned</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="WOF expiry">
              <input
                type="date"
                className={inputClass}
                value={form.wof_expiry}
                onChange={(e) => setForm({ ...form, wof_expiry: e.target.value })}
              />
            </Field>
            <Field label="Rego expiry">
              <input
                type="date"
                className={inputClass}
                value={form.rego_expiry}
                onChange={(e) => setForm({ ...form, rego_expiry: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Next service due (km)">
              <input
                type="number"
                inputMode="numeric"
                className={inputClass}
                value={form.next_service_km}
                onChange={(e) => setForm({ ...form, next_service_km: e.target.value })}
              />
            </Field>
            <Field label="Next service date">
              <input
                type="date"
                className={inputClass}
                value={form.next_service_date}
                onChange={(e) => setForm({ ...form, next_service_date: e.target.value })}
              />
            </Field>
          </div>
          <p className="-mt-1 text-xs text-muted">
            Used until a service is logged under Servicing - after that the next one is due every 10,000 km from
            the last.
          </p>
          <Field label="Notes">
            <textarea
              className={inputClass + " min-h-16 resize-y"}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          {error && <p className="text-sm text-brand-red">{error}</p>}
        </Modal>
      )}
    </div>
  );
}
