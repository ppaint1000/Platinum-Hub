"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { LostToField } from "./LostToField";
import { ConfirmDialog } from "@/components/orders/ConfirmDialog";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "quoted", label: "Quoted" },
  { value: "won", label: "Won" },
  { value: "in_progress", label: "In progress" },
  { value: "complete", label: "Complete" },
  { value: "lost", label: "Lost" },
] as const;

type JobStatus = (typeof STATUS_OPTIONS)[number]["value"];

// Escape hatch alongside the "Mark as X" buttons - those only ever move a
// job forward. This lets a mis-click (wrong job marked won/in progress/etc)
// be reverted to any status, not just the next one in the usual sequence.
export function JobStatusControl({
  jobId,
  currentStatus,
  currentLostTo,
  lostToOptions,
  salesTeam,
}: {
  jobId: string;
  currentStatus: JobStatus;
  currentLostTo: string | null;
  lostToOptions: string[];
  salesTeam: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<JobStatus>(currentStatus);
  const [lostTo, setLostTo] = useState(currentLostTo ?? "");
  // Moving a job into "quoted" asks which sales person quoted it before
  // saving - the Sales page credits quoted $ by lead_by_user_id, so a
  // quoted job with nobody attached to it wouldn't show up there.
  const [quotedBy, setQuotedBy] = useState("");
  const [askingQuotedBy, setAskingQuotedBy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setOpen(false);
    setTarget(currentStatus);
    setLostTo(currentLostTo ?? "");
    setQuotedBy("");
    setAskingQuotedBy(false);
    setError(null);
  }

  function confirmChange() {
    if (target === currentStatus && target !== "lost") {
      setOpen(false);
      return;
    }
    if (target === "quoted") {
      setQuotedBy("");
      setError(null);
      setAskingQuotedBy(true);
      return;
    }
    save();
  }

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();

    const update: Record<string, unknown> = { status: target };
    if (target === "lost") {
      update.lost_at = new Date().toISOString().slice(0, 10);
      update.lost_to = lostTo.trim();
    } else {
      update.lost_at = null;
      update.lost_to = null;
    }
    // Reverting back to draft/quoted releases the job number and won date -
    // marking it won again later issues a fresh number rather than
    // resurrecting one assigned by mistake.
    if (target === "draft" || target === "quoted") {
      update.job_number = null;
      update.won_at = null;
    }
    if (target === "quoted") {
      update.lead_by_user_id = quotedBy;
    }

    const { error: updateError } = await supabase.from("jobs").update(update).eq("id", jobId);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setAskingQuotedBy(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Change status
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <select
          autoFocus
          value={target}
          onChange={(e) => setTarget(e.target.value as JobStatus)}
          className="rounded border border-line px-2 py-1.5 text-sm"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {target === "lost" && (
          <LostToField value={lostTo} onChange={setLostTo} options={lostToOptions} />
        )}
        <Button onClick={confirmChange} disabled={saving}>
          {saving ? "Saving…" : "Confirm"}
        </Button>
        <Button variant="secondary" onClick={cancel}>
          Cancel
        </Button>
      </div>
      {error && !askingQuotedBy && <p className="text-sm text-red-600">{error}</p>}
      {askingQuotedBy && (
        <ConfirmDialog
          title="Who quoted this job?"
          message="Choose the sales person to record this quote against. It counts towards their quoted total on the Sales page."
          confirmLabel="Mark as quoted"
          confirmingLabel="Saving…"
          tone="primary"
          confirming={saving}
          error={error}
          onConfirm={() => {
            if (!quotedBy) {
              setError("Choose a sales person to continue.");
              return;
            }
            save();
          }}
          onCancel={() => {
            setAskingQuotedBy(false);
            setError(null);
          }}
        >
          {salesTeam.length === 0 ? (
            <p className="text-sm text-ink-soft">
              No sales people are set up yet. Tick “Sales” for someone on the Users page first.
            </p>
          ) : (
            <select
              autoFocus
              value={quotedBy}
              onChange={(e) => setQuotedBy(e.target.value)}
              className="w-full rounded border border-line px-2 py-1.5 text-sm"
            >
              <option value="" disabled>
                Choose a sales person…
              </option>
              {salesTeam.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
