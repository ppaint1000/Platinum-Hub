"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, inputClass } from "@/components/fleet/Modal";
import { ExpiryChip } from "@/components/fleet/StatusChip";
import { fmtKm } from "@/lib/fleet/format";

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
  notes: string | null;
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
  notes: string;
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
  notes: "",
};

export function VehiclesClient({
  initialVehicles,
  drivers,
}: {
  initialVehicles: Vehicle[];
  drivers: Driver[];
}) {
  const router = useRouter();
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
      notes: v.notes ?? "",
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
      notes: form.notes.trim() || null,
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
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          Add vehicle
        </button>
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
                <th className="px-5 py-3">WOF</th>
                <th className="px-5 py-3">Rego</th>
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
                  <td className="whitespace-nowrap px-5 py-3">{fmtKm(v.current_odometer_km)}</td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <ExpiryChip date={v.wof_expiry} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <ExpiryChip date={v.rego_expiry} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEdit(v)}
                        aria-label="Edit"
                        className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => remove(v)}
                        aria-label="Delete"
                        className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-brand-red"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
