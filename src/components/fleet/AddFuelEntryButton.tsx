"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal, Field, inputClass } from "@/components/fleet/Modal";
import { readReceipt } from "@/lib/fleet/readReceipt";

type Vehicle = { id: string; plate: string; make: string; model: string; assigned_driver_id: string | null };
type Option = { id: string; label: string };

// Same picker value the driver form uses for the waterblaster - no vehicle
// or odometer, charged to a job (fleet_waterblaster_fuel.sql's trigger adds
// the cost line to that job).
const WATERBLASTER = "waterblaster";

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type FormState = {
  driverId: string;
  vehicleId: string;
  jobId: string;
  fuelledOn: string;
  odometer: string;
  litres: string;
  cost: string;
};

// An existing entry, for Edit - e.g. filling in the numbers a driver
// couldn't (see alertIncompleteFuelEntryAction).
export type EditableFuelEntry = {
  id: string;
  driver_id: string;
  vehicle_id: string | null;
  equipment: string | null;
  job_id: string | null;
  fuelled_on: string;
  odometer_km: number | null;
  litres: number | null;
  cost_total: number | null;
  receipt_photo_path: string | null;
};

type Lists = { drivers: Option[]; vehicles: Vehicle[]; jobs: Option[] };

// Admin-only manual fill-up, e.g. a receipt handed in at the office. Unlike
// the driver form (/fleet/log), the admin picks who it's for, and the
// receipt photo is optional; no GPS since it's not logged at the pump.
export function AddFuelEntryButton(lists: Lists) {
  return <FuelEntryModalButton {...lists} />;
}

export function EditFuelEntryButton({ entry, ...lists }: Lists & { entry: EditableFuelEntry }) {
  return <FuelEntryModalButton {...lists} entry={entry} />;
}

function formFromEntry(entry: EditableFuelEntry): FormState {
  return {
    driverId: entry.driver_id,
    vehicleId: entry.equipment === WATERBLASTER ? WATERBLASTER : entry.vehicle_id ?? "",
    jobId: entry.job_id ?? "",
    fuelledOn: entry.fuelled_on,
    odometer: entry.odometer_km != null ? String(entry.odometer_km) : "",
    litres: entry.litres != null ? String(entry.litres) : "",
    cost: entry.cost_total != null ? Number(entry.cost_total).toFixed(2) : "",
  };
}

function FuelEntryModalButton({
  drivers,
  vehicles,
  jobs,
  entry,
}: Lists & { entry?: EditableFuelEntry }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [receipt, setReceipt] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const readIdRef = useRef(0);

  const isWaterblaster = form.vehicleId === WATERBLASTER;

  function emptyForm(): FormState {
    return { driverId: "", vehicleId: "", jobId: "", fuelledOn: todayLocal(), odometer: "", litres: "", cost: "" };
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openModal() {
    readIdRef.current++;
    setForm(entry ? formFromEntry(entry) : emptyForm());
    setReceipt(null);
    setReading(false);
    setError(null);
    setOpen(true);
  }

  // Picking a driver defaults the vehicle to the one assigned to them, as
  // long as no vehicle has been chosen yet.
  function pickDriver(driverId: string) {
    setForm((f) => ({
      ...f,
      driverId,
      vehicleId: f.vehicleId || (vehicles.find((v) => v.assigned_driver_id === driverId)?.id ?? ""),
    }));
  }

  // Same receipt reader as the driver form - fills only empty boxes.
  async function pickReceipt(file: File | undefined) {
    if (!file) return;
    setReceipt(file);
    const readId = ++readIdRef.current;
    setReading(true);
    try {
      const r = await readReceipt(file);
      if (readId !== readIdRef.current) return;
      setForm((f) => ({
        ...f,
        // A new entry takes the receipt date; an existing one keeps its own.
        fuelledOn: entry ? f.fuelledOn : r.date ?? f.fuelledOn,
        odometer: f.odometer || (r.odometerKm !== null ? String(r.odometerKm) : ""),
        litres: f.litres || (r.litres !== null ? String(r.litres) : ""),
        cost: f.cost || (r.cost !== null ? r.cost.toFixed(2) : ""),
      }));
    } catch {
      // Unreadable receipt - the admin just types the numbers.
    } finally {
      if (readId === readIdRef.current) setReading(false);
    }
  }

  async function save() {
    setError(null);
    if (!form.driverId) return setError("Choose the driver.");
    if (!form.vehicleId) return setError("Choose a vehicle.");
    if (isWaterblaster && !form.jobId) return setError("Choose the job the waterblaster fuel is for.");
    if (!form.fuelledOn) return setError("Enter the date.");
    if (form.fuelledOn > todayLocal()) return setError("The date can't be in the future.");
    if (!isWaterblaster && (!form.odometer || Number(form.odometer) <= 0))
      return setError("Enter the odometer reading.");
    if (!form.litres || Number(form.litres) <= 0) return setError("Enter the litres.");
    if (!form.cost || Number(form.cost) <= 0) return setError("Enter the total cost.");

    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return setError("Your session expired — sign in again.");
    }

    // Stored under the admin's own folder - fleet-photos' storage policy
    // only lets someone upload into a folder named with their own id.
    let receiptPath: string | null = null;
    if (receipt) {
      receiptPath = `${user.id}/${Date.now()}-receipt.jpg`;
      const { error: uploadError } = await supabase.storage.from("fleet-photos").upload(receiptPath, receipt);
      if (uploadError) {
        setSaving(false);
        return setError("Couldn't upload the receipt photo — " + uploadError.message);
      }
    }

    const payload = {
      driver_id: form.driverId,
      vehicle_id: isWaterblaster ? null : form.vehicleId,
      equipment: isWaterblaster ? WATERBLASTER : null,
      job_id: isWaterblaster ? form.jobId : null,
      fuelled_on: form.fuelledOn,
      odometer_km: isWaterblaster ? null : Number(form.odometer),
      litres: Number(form.litres),
      cost_total: Number(form.cost),
      // Editing without a new photo keeps the one already on the entry.
      receipt_photo_path: receiptPath ?? entry?.receipt_photo_path ?? null,
    };

    const { error: saveError } = entry
      ? await supabase.from("fuel_entries").update(payload).eq("id", entry.id)
      : await supabase.from("fuel_entries").insert({ ...payload, odometer_photo_path: null });

    setSaving(false);
    if (saveError) return setError("Couldn't save — " + saveError.message);

    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {entry ? (
        <button
          onClick={openModal}
          aria-label="Edit entry"
          className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-ink"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          Add entry
        </button>
      )}

      {open && (
        <Modal
          title={entry ? "Edit fuel entry" : "Add fuel entry"}
          onClose={() => setOpen(false)}
          onSave={save}
          saving={saving}
        >
          <Field
            label={
              entry?.receipt_photo_path
                ? "Replace receipt photo (optional)"
                : "Receipt photo (optional — fills in the numbers)"
            }
          >
            <button
              type="button"
              onClick={() => receiptInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-background py-2.5 text-sm text-muted transition hover:border-brand-red/40 hover:text-ink"
            >
              {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {reading ? "Reading the receipt…" : receipt ? receipt.name : "Upload receipt"}
            </button>
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                pickReceipt(e.target.files?.[0]);
                e.target.value = "";
              }}
              className="hidden"
            />
          </Field>

          <Field label="Driver" required>
            <select value={form.driverId} onChange={(e) => pickDriver(e.target.value)} className={inputClass}>
              <option value="">Choose the driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Vehicle" required>
            <select value={form.vehicleId} onChange={(e) => set("vehicleId", e.target.value)} className={inputClass}>
              <option value="">Choose a vehicle…</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} — {v.plate}
                </option>
              ))}
              <option value={WATERBLASTER}>Waterblaster</option>
            </select>
          </Field>

          {isWaterblaster && (
            <Field label="Job" required>
              <select value={form.jobId} onChange={(e) => set("jobId", e.target.value)} className={inputClass}>
                <option value="">Choose the job…</option>
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className={`grid gap-3 ${isWaterblaster ? "grid-cols-1" : "grid-cols-2"}`}>
            <Field label="Date" required>
              <input
                type="date"
                value={form.fuelledOn}
                max={todayLocal()}
                onChange={(e) => set("fuelledOn", e.target.value)}
                className={`${inputClass} min-w-0`}
              />
            </Field>
            {!isWaterblaster && (
              <Field label="Odometer (km)" required>
                <input
                  type="number"
                  inputMode="numeric"
                  value={form.odometer}
                  onChange={(e) => set("odometer", e.target.value)}
                  className={`${inputClass} min-w-0`}
                />
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Litres" required>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={form.litres}
                onChange={(e) => set("litres", e.target.value)}
                className={`${inputClass} min-w-0`}
              />
            </Field>
            <Field label="Total cost ($)" required>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={form.cost}
                onChange={(e) => set("cost", e.target.value)}
                className={`${inputClass} min-w-0`}
              />
            </Field>
          </div>

          {error && (
            <p role="alert" className="text-sm text-brand-red">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
