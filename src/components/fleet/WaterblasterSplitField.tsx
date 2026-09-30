"use client";

import { useState } from "react";
import { splitWaterblasterFuel } from "@/lib/fleet/waterblasterSplit";

type JobOption = { id: string; label: string };

// "Some of this fuel was for the water blaster" on a vehicle fill-up. Once
// the litres are entered, a pop-up asks which job site it was for.
export function WaterblasterSplitField({
  enabled,
  onEnabledChange,
  litres,
  onLitresChange,
  jobId,
  onJobChange,
  jobs,
  totalLitres,
  totalCost,
  inputClass,
}: {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  litres: string;
  onLitresChange: (litres: string) => void;
  jobId: string;
  onJobChange: (jobId: string) => void;
  jobs: JobOption[];
  totalLitres: string;
  totalCost: string;
  inputClass: string;
}) {
  const [picking, setPicking] = useState(false);
  const [draftJob, setDraftJob] = useState("");

  function openPicker() {
    setDraftJob(jobId);
    setPicking(true);
  }

  // Ask for the job site as soon as the litres are in (if not chosen yet).
  function litresEntered() {
    if (Number(litres) > 0 && !jobId) openPicker();
  }

  const job = jobs.find((j) => j.id === jobId);
  const total = Number(totalLitres);
  const wb = Number(litres);
  const split =
    enabled && total > 0 && wb > 0 && wb < total
      ? splitWaterblasterFuel(total, totalCost ? Number(totalCost) : null, wb)
      : null;
  const money = (n: number | null) => (n === null ? "" : ` · $${n.toFixed(2)}`);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            onEnabledChange(e.target.checked);
            if (!e.target.checked) {
              onLitresChange("");
              onJobChange("");
            }
          }}
          className="h-5 w-5 accent-brand-red"
        />
        Some of this fuel was for the water blaster
      </label>

      {enabled && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="wb-litres" className="text-sm font-medium text-foreground">
              Water blaster fuel (litres)
            </label>
            <input
              id="wb-litres"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={litres}
              onChange={(e) => onLitresChange(e.target.value)}
              onBlur={litresEntered}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  litresEntered();
                }
              }}
              placeholder="0.00"
              className={inputClass}
            />
          </div>

          {job ? (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>
                <span className="text-muted">Job site: </span>
                <span className="font-medium text-ink">{job.label}</span>
              </span>
              <button type="button" onClick={openPicker} className="min-h-11 shrink-0 font-medium text-brand-red hover:underline">
                Change
              </button>
            </div>
          ) : (
            Number(litres) > 0 && (
              <button
                type="button"
                onClick={openPicker}
                className="min-h-11 rounded-lg border border-brand-red px-3 text-sm font-semibold text-brand-red"
              >
                Choose the job site
              </button>
            )
          )}

          {split && (
            <div className="rounded-md bg-surface px-3 py-2 text-xs text-muted">
              <p>
                <span className="font-semibold text-ink">Vehicle:</span> {split.vehicleLitres.toFixed(2)} L
                {money(split.vehicleCost)}
              </p>
              <p>
                <span className="font-semibold text-ink">Water blaster:</span> {split.waterblasterLitres.toFixed(2)} L
                {money(split.waterblasterCost)}
                {job ? " — added to the job's costs" : ""}
              </p>
            </div>
          )}
        </>
      )}

      {picking && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="wb-job-title"
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
        >
          <div className="w-full max-w-sm rounded-xl bg-surface p-5 shadow-xl">
            <h2 id="wb-job-title" className="text-base font-semibold text-ink">
              Which job site was the water blaster fuel for?
            </h2>
            <p className="mt-1 text-sm text-muted">
              {Number(litres) > 0 ? `${litres} L` : "The fuel"} will be added to this job&apos;s costs.
            </p>
            <select
              autoFocus
              value={draftJob}
              onChange={(e) => setDraftJob(e.target.value)}
              className={`${inputClass} mt-4 w-full`}
            >
              <option value="">Choose the job site…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPicking(false)}
                className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!draftJob}
                onClick={() => {
                  onJobChange(draftJob);
                  setPicking(false);
                }}
                className="min-h-11 rounded-lg bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
