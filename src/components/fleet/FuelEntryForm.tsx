"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, MapPin, MapPinOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Vehicle = { id: string; plate: string; make: string; model: string };

type GpsState =
  | { status: "locating" }
  | { status: "ok"; lat: number; lng: number; accuracy: number }
  | { status: "denied" | "unavailable" };

export function FuelEntryForm({ vehicles }: { vehicles: Vehicle[] }) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
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

  const receiptInputRef = useRef<HTMLInputElement>(null);
  const odometerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!vehicleId) return setError("Choose a vehicle.");
    if (!receiptPhoto) return setError("Photograph the fuel receipt.");
    if (!odometerPhoto) return setError("Photograph the odometer.");
    if (!odometer || Number(odometer) <= 0)
      return setError("Enter the odometer reading.");
    if (!litres || Number(litres) <= 0) return setError("Enter the litres.");
    if (!cost || Number(cost) <= 0) return setError("Enter the total cost.");

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
    const odometerPath = `${user.id}/${stamp}-odometer.jpg`;

    const [receiptUpload, odometerUpload] = await Promise.all([
      supabase.storage.from("fleet-photos").upload(receiptPath, receiptPhoto),
      supabase.storage
        .from("fleet-photos")
        .upload(odometerPath, odometerPhoto),
    ]);

    if (receiptUpload.error || odometerUpload.error) {
      setError("Couldn't upload the photos. Check your connection and try again.");
      setSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase.from("fuel_entries").insert({
      driver_id: user.id,
      vehicle_id: vehicleId,
      odometer_km: Number(odometer),
      litres: Number(litres),
      cost_total: Number(cost),
      receipt_photo_path: receiptPath,
      odometer_photo_path: odometerPath,
      gps_lat: gps.status === "ok" ? gps.lat : null,
      gps_lng: gps.status === "ok" ? gps.lng : null,
      gps_accuracy_m: gps.status === "ok" ? gps.accuracy : null,
    });

    if (insertError) {
      setError("Couldn't save the entry. Try again.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setDone(true);
  }

  function resetForNext() {
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
        <button
          onClick={resetForNext}
          className="mt-6 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black"
        >
          Log another entry
        </button>
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
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <PhotoCapture
          label="Receipt photo"
          inputRef={receiptInputRef}
          preview={receiptPreview}
          onChange={(f) => pickPhoto(f, setReceiptPhoto, setReceiptPreview)}
        />
        <PhotoCapture
          label="Odometer photo"
          inputRef={odometerInputRef}
          preview={odometerPreview}
          onChange={(f) => pickPhoto(f, setOdometerPhoto, setOdometerPreview)}
        />
      </div>

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
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
        />
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
    </div>
  );
}
