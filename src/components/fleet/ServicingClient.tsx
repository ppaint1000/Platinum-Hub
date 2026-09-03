"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, inputClass } from "@/components/fleet/Modal";
import { fmtDate, fmtKm, fmtMoney } from "@/lib/fleet/format";

type Vehicle = { id: string; plate: string; make: string; model: string };

type ServiceRecord = {
  id: string;
  vehicle_id: string;
  date: string;
  odometer_km: number | null;
  type: string | null;
  description: string | null;
  cost: number | null;
  next_due_date: string | null;
  next_due_odometer_km: number | null;
  vehicle: { plate: string; make: string; model: string } | null;
};

type FormState = {
  vehicle_id: string;
  date: string;
  odometer_km: string;
  type: string;
  description: string;
  cost: string;
  next_due_date: string;
  next_due_odometer_km: string;
};

const TYPES = ["Service", "Repair", "WOF Check", "Tyres", "Other"];

function emptyForm(defaultVehicle: string): FormState {
  return {
    vehicle_id: defaultVehicle,
    date: "",
    odometer_km: "",
    type: "",
    description: "",
    cost: "",
    next_due_date: "",
    next_due_odometer_km: "",
  };
}

export function ServicingClient({
  initialRecords,
  vehicles,
}: {
  initialRecords: ServiceRecord[];
  vehicles: Vehicle[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ServiceRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm(vehicles[0]?.id ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openAdd() {
    setForm(emptyForm(vehicles[0]?.id ?? ""));
    setError(null);
    setAdding(true);
  }

  function openEdit(r: ServiceRecord) {
    setForm({
      vehicle_id: r.vehicle_id,
      date: r.date,
      odometer_km: r.odometer_km?.toString() ?? "",
      type: r.type ?? "",
      description: r.description ?? "",
      cost: r.cost?.toString() ?? "",
      next_due_date: r.next_due_date ?? "",
      next_due_odometer_km: r.next_due_odometer_km?.toString() ?? "",
    });
    setError(null);
    setEditing(r);
  }

  function close() {
    setAdding(false);
    setEditing(null);
  }

  async function save() {
    if (!form.vehicle_id) return setError("Choose a vehicle.");
    if (!form.date) return setError("Date is required.");

    setSaving(true);
    setError(null);
    const supabase = createClient();

    const payload = {
      vehicle_id: form.vehicle_id,
      date: form.date,
      odometer_km: form.odometer_km ? Number(form.odometer_km) : null,
      type: form.type || null,
      description: form.description.trim() || null,
      cost: form.cost ? Number(form.cost) : null,
      next_due_date: form.next_due_date || null,
      next_due_odometer_km: form.next_due_odometer_km ? Number(form.next_due_odometer_km) : null,
    };

    const { error } = editing
      ? await supabase.from("service_records").update(payload).eq("id", editing.id)
      : await supabase.from("service_records").insert(payload);

    setSaving(false);
    if (error) return setError("Couldn't save — " + error.message);

    close();
    router.refresh();
  }

  async function remove(r: ServiceRecord) {
    if (!confirm("Delete this service record? This can't be undone.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("service_records").delete().eq("id", r.id);
    if (error) return alert("Couldn't delete — " + error.message);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Servicing</h1>
          <p className="mt-1 text-sm text-muted">
            {initialRecords.length} record{initialRecords.length === 1 ? "" : "s"} on file
          </p>
        </div>
        <button
          onClick={openAdd}
          disabled={vehicles.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add record
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {initialRecords.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            {vehicles.length === 0
              ? "Add a vehicle first, then log its service history."
              : "No service records yet."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Vehicle</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3">Cost</th>
                <th className="px-5 py-3">Next due</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {initialRecords.map((r) => {
                const v = r.vehicle;
                const nextDue = r.next_due_date
                  ? fmtDate(r.next_due_date)
                  : r.next_due_odometer_km
                  ? fmtKm(r.next_due_odometer_km)
                  : "—";
                return (
                  <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-background">
                    <td className="whitespace-nowrap px-5 py-3">{fmtDate(r.date)}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {v ? `${v.make} ${v.model} — ${v.plate}` : "Unknown"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">{r.type ?? "—"}</td>
                    <td className="max-w-xs px-5 py-3">{r.description ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3">{r.cost ? fmtMoney(r.cost) : "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3">{nextDue}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(r)}
                          aria-label="Edit"
                          className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-ink"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => remove(r)}
                          aria-label="Delete"
                          className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-brand-red"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {(adding || editing) && (
        <Modal
          title={editing ? "Edit service record" : "Add service record"}
          onClose={close}
          onSave={save}
          saving={saving}
        >
          <Field label="Vehicle" required>
            <select
              className={inputClass}
              value={form.vehicle_id}
              onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} — {v.plate}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required>
              <input
                type="date"
                className={inputClass}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="Odometer (km)">
              <input
                type="number"
                className={inputClass}
                value={form.odometer_km}
                onChange={(e) => setForm({ ...form, odometer_km: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Type">
            <select
              className={inputClass}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value=""></option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Description">
            <textarea
              className={inputClass + " min-h-16 resize-y"}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="Cost ($)">
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Next due date">
              <input
                type="date"
                className={inputClass}
                value={form.next_due_date}
                onChange={(e) => setForm({ ...form, next_due_date: e.target.value })}
              />
            </Field>
            <Field label="Next due (km)">
              <input
                type="number"
                className={inputClass}
                value={form.next_due_odometer_km}
                onChange={(e) => setForm({ ...form, next_due_odometer_km: e.target.value })}
              />
            </Field>
          </div>
          {error && <p className="text-sm text-brand-red">{error}</p>}
        </Modal>
      )}
    </div>
  );
}
