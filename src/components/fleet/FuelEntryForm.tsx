"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, Loader2, MapPin, MapPinOff, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { readReceipt } from "@/lib/fleet/readReceipt";
import { alertIncompleteFuelEntryAction } from "@/app/fleet/actions";

type Vehicle = { id: string; plate: string; make: string; model: string };
type JobOption = { id: string; label: string };

type GpsState =
  | { status: "locating" }
  | { status: "ok"; lat: number; lng: number; accuracy: number }
  | { status: "denied" | "unavailable" };

// Picker value for the waterblaster - not a vehicle, so it has no odometer
// and is charged to a job instead (see fleet_waterblaster_fuel.sql, whose
// trigger turns the entry into a cost line on that job).
const WATERBLASTER = "waterblaster";

// Today as YYYY-MM-DD in the phone's own timezone - toISOString() would
// give the UTC date, which is yesterday for most of a NZ morning.
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function FuelEntryForm({
  vehicles,
  defaultVehicleId,
  jobs,
  backLink,
}: {
  vehicles: Vehicle[];
  defaultVehicleId: string;
  jobs: JobOption[];
  // Shown on "Entry saved" - Timesheets for painters, Hub for admins/supervisors.
  backLink: { href: string; label: string } | null;
}) {
  const [vehicleId, setVehicleId] = useState(defaultVehicleId);
  const [jobId, setJobId] = useState("");
  const isWaterblaster = vehicleId === WATERBLASTER;
  const [fuelledOn, setFuelledOn] = useState(todayLocal);
  // True once the driver picks a date themselves - the receipt reader then
  // leaves it alone, same as it does for boxes they've typed into.
  const dateTouchedRef = useRef(false);
  const [odometer, setOdometer] = useState("");
  const [litres, setLitres] = useState("");
  const [cost, setCost] = useState("");
  const [receiptPhoto, setReceiptPhoto] = useState<File | null>(null);
  const [odometerPhoto, setOdometerPhoto] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [odometerPreview, setOdometerPreview] = useState<string | null>(null);
  const [gps, setGps] = useState<GpsState>({ status: "locating" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [scan, setScan] = useState<"idle" | "reading" | "filled" | "failed">("idle");
  const scanIdRef = useRef(0);

  const receiptInputRef = useRef<HTMLInputElement>(null);
  const odometerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { 
if (!("geolocation" in navigator)) { 
// eslint-disable-next-line react-hooks/set-state-in-effect 
setGps({ status: "unavailable" }); 
return; 
}
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setGps({
          status: "ok",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => setGps({ status: "denied" }),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, []);

  const costPerLitre =
    litres && cost && Number(litres) > 0
      ? Number(cost) / Number(litres)
      : null;

  function pickPhoto(
    file: File | undefined,
    setFile: (f: File | null) => void,
    setPreview: (u: string | null) => void
  ) {
    if (!file) return;
    setFile(file);
    setPreview(URL.createObjectURL(file));
  }

  // Pre-fills odometer/litres/cost from the receipt photo. Only fills
  // boxes that are still empty, so it never overwrites what the driver has
  // typed; a newer photo supersedes a read still in progress.
  async function scanReceipt(file: File | undefined) {
    if (!file) return;
    const scanId = ++scanIdRef.current;
    setScan("reading");
    try {
      const reading = await readReceipt(file);
      if (scanId !== scanIdRef.current) return;
      const found = [reading.date, reading.odometerKm, reading.litres, reading.cost].filter((v) => v !== null).length;
      if (reading.date !== null && !dateTouchedRef.current) setFuelledOn(reading.date);
      if (reading.odometerKm !== null) setOdometer((prev) => prev || String(reading.odometerKm));
      if (reading.litres !== null) setLitres((prev) => prev || String(reading.litres));
      if (reading.cost !== null) setCost((prev) => prev || reading.cost!.toFixed(2));
      setScan(found > 0 ? "filled" : "failed");
    } catch {
      if (scanId === scanIdRef.current) setScan("failed");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!vehicleId) return setError("Choose a vehicle.");
    if (!fuelledOn) return setError("Enter the date you filled up.");
    if (fuelledOn > todayLocal()) return setError("The date can't be in the future.");
    if (isWaterblaster && !jobId) return setError("Choose the job the waterblaster fuel is for.");
    if (!receiptPhoto) return setError("Photograph the fuel receipt.");
    // The numbers are optional (an unreadable receipt shouldn't block the
    // driver) - but anything entered has to be a real value.
    if (!isWaterblaster && odometer && Number(odometer) <= 0) return setError("Check the odometer reading.");
    if (litres && Number(litres) <= 0) return setError("Check the litres.");
    if (cost && Number(cost) <= 0) return setError("Check the total cost.");

    const missing = [
      ...(!isWaterblaster && !odometer ? ["mileage"] : []),
      ...(!litres ? ["litres"] : []),
      ...(!cost ? ["cost"] : []),
    ];
    if (
      missing.length > 0 &&
      !confirm(`The ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} empty. Save anyway? The office will be asked to fill ${missing.length === 1 ? "it" : "them"} in from your receipt photo.`)
    )
      return;

    setSubmitting(true);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Your session expired — sign in again.");
      setSubmitting(false);
      return;
    }

    const stamp = Date.now();
    const receiptPath = `${user.id}/${stamp}-receipt.jpg`;
    // Optional - the receipt already carries the mileage.
    const odometerPath = !isWaterblaster && odometerPhoto ? `${user.id}/${stamp}-odometer.jpg` : null;

    const [receiptUpload, odometerUpload] = await Promise.all([
      supabase.storage.from("fleet-photos").upload(receiptPath, receiptPhoto),
      odometerPath && odometerPhoto
        ? supabase.storage.from("fleet-photos").upload(odometerPath, odometerPhoto)
        : Promise.resolve({ error: null }),
    ]);

    if (receiptUpload.error || odometerUpload.error) {
      setError("Couldn't upload the photos. Check your connection and try again.");
      setSubmitting(false);
      return;
    }

    const { data: saved, error: insertError } = await supabase.from("fuel_entries").insert({
      driver_id: user.id,
      vehicle_id: isWaterblaster ? null : vehicleId,
      equipment: isWaterblaster ? WATERBLASTER : null,
      job_id: isWaterblaster ? jobId : null,
      fuelled_on: fuelledOn,
      odometer_km: isWaterblaster || !odometer ? null : Number(odometer),
      litres: litres ? Number(litres) : null,
      cost_total: cost ? Number(cost) : null,
      receipt_photo_path: receiptPath,
      odometer_photo_path: odometerPath,
      gps_lat: gps.status === "ok" ? gps.lat : null,
      gps_lng: gps.status === "ok" ? gps.lng : null,
      gps_accuracy_m: gps.status === "ok" ? gps.accuracy : null,
    }).select("id").single();

    if (insertError) {
      setError("Couldn't save the entry. Try again.");
      setSubmitting(false);
      return;
    }

    // Emails the admins. The entry is saved and flagged in the Fuel Log
    // regardless, so a failure here isn't shown to the driver.
    if (missing.length > 0 && saved) {
      await alertIncompleteFuelEntryAction(saved.id).catch(() => {});
    }

    setSubmitting(false);
    setDone(true);
  }

  function resetForNext() {
    scanIdRef.current++;
    setScan("idle");
    setJobId("");
    setFuelledOn(todayLocal());
    dateTouchedRef.current = false;
    setOdometer("");
    setLitres("");
    setCost("");
    setReceiptPhoto(null);
    setOdometerPhoto(null);
    setReceiptPreview(null);
    setOdometerPreview(null);
    if (receiptInputRef.current) receiptInputRef.current.value = "";
    if (odometerInputRef.current) odometerInputRef.current.value = "";
    setDone(false);
  }

  if (done) {
    return (
      <div className="mt-10 flex flex-col items-center rounded-xl border border-border bg-surface p-8 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
          <Check className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">Entry saved</h2>
        <p className="mt-1 text-sm text-muted">
          Your fuel entry has been recorded.
        </p>
        <div className="mt-6 flex w-full flex-col gap-2">
          {backLink && (
            <Link
              href={backLink.href}
              className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black"
            >
              {backLink.label}
            </Link>
          )}
          <button
            onClick={resetForNext}
            className={
              backLink
                ? "rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-background"
                : "rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black"
            }
          >
            Log another entry
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-5">
      <GpsIndicator gps={gps} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Vehicle</label>
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
        >
          {vehicles.length === 0 && <option value="">No vehicles set up</option>}
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.make} {v.model} — {v.plate}
            </option>
          ))}
          <option value={WATERBLASTER}>Waterblaster</option>
        </select>
      </div>

      {isWaterblaster && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Job</label>
          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
          >
            <option value="">Choose the job…</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">The fuel cost is added to this job once you save.</p>
        </div>
      )}

      <div className={`grid gap-3 ${isWaterblaster ? "grid-cols-1" : "grid-cols-2"}`}>
        <PhotoCapture
          label="Receipt photo"
          inputRef={receiptInputRef}
          preview={receiptPreview}
          onChange={(f) => {
            pickPhoto(f, setReceiptPhoto, setReceiptPreview);
            scanReceipt(f);
          }}
        />
        {!isWaterblaster && (
          <PhotoCapture
            label="Odometer photo (optional)"
            inputRef={odometerInputRef}
            preview={odometerPreview}
            onChange={(f) => pickPhoto(f, setOdometerPhoto, setOdometerPreview)}
          />
        )}
      </div>

      {scan === "reading" && (
        <div className="-mt-2 flex items-center gap-2 rounded-lg bg-border/40 px-3 py-2 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Reading the receipt… (the first time takes a little longer)
        </div>
      )}
      {scan === "filled" && (
        <div className="-mt-2 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          <Check className="h-3.5 w-3.5" />
          Filled in from the receipt — check the numbers match before saving.
        </div>
      )}
      {scan === "failed" && (
        <div className="-mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Couldn&apos;t read the receipt — type the numbers in below.
        </div>
      )}

      <div className={`grid gap-3 ${isWaterblaster ? "grid-cols-1" : "grid-cols-2"}`}>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Date</label>
          <input
            type="date"
            value={fuelledOn}
            max={todayLocal()}
            onChange={(e) => {
              dateTouchedRef.current = true;
              setFuelledOn(e.target.value);
            }}
            className="min-w-0 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
          />
        </div>
        {!isWaterblaster && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">
              Odometer reading (km)
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              placeholder="e.g. 45410"
              className="min-w-0 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Litres</label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={litres}
            onChange={(e) => setLitres(e.target.value)}
            placeholder="0.00"
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            Total cost ($)
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="0.00"
            className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
          />
        </div>
      </div>

      {costPerLitre !== null && (
        <p className="-mt-2 text-sm text-muted">
          ${costPerLitre.toFixed(2)} per litre
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-brand-red">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="mt-1 flex items-center justify-center gap-2 rounded-lg bg-ink py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Saving…" : "Save entry"}
      </button>
    </form>
  );
}

function GpsIndicator({ gps }: { gps: GpsState }) {
  if (gps.status === "locating") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-border/40 px-3 py-2 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Getting your location…
      </div>
    );
  }
  if (gps.status === "ok") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
        <MapPin className="h-3.5 w-3.5" />
        Location captured (±{Math.round(gps.accuracy)}m)
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
      <MapPinOff className="h-3.5 w-3.5" />
      Location unavailable — entry will save without it
    </div>
  );
}

function PhotoCapture({
  label,
  inputRef,
  preview,
  onChange,
}: {
  label: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  preview: string | null;
  onChange: (file: File | undefined) => void;
}) {
  const uploadRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-background text-muted transition hover:border-brand-red/40"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-xs">
            <Camera className="h-5 w-5" />
            Take photo
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => onChange(e.target.files?.[0])}
        className="hidden"
      />
      {/* Same field, but without capture= so the phone offers its photo
          library / files instead of jumping straight to the camera - for
          a receipt or odometer shot that was taken earlier. */}
      <button
        type="button"
        onClick={() => uploadRef.current?.click()}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface py-1.5 text-xs font-medium text-muted transition hover:border-brand-red/40 hover:text-ink"
      >
        <Upload className="h-3.5 w-3.5" />
        Upload photo
      </button>
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          onChange(e.target.files?.[0]);
          // Cleared so picking the same file again still fires onChange.
          e.target.value = "";
        }}
        className="hidden"
      />
    </div>
  );
}
