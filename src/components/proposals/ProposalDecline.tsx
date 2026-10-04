"use client";

// "Not going ahead?" under the acceptance form (like Tradify's decline
// online): the customer picks a reason - and who they went with, if
// another painter - so it lands in the Lost quotes report instead of going
// quiet. Goes through the token-checked proposal_decline function.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export const DECLINE_REASONS = [
  "Went with another painter",
  "The price is more than we wanted to spend",
  "Decided not to go ahead with the painting",
  "The timing isn't right",
  "Other",
];

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-base outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red";

export function ProposalDecline({ token, code, preview }: { token: string; code: string | null; preview: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [who, setWho] = useState("");
  const [comments, setComments] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <p className="text-sm text-muted print:hidden">
        Not going ahead?{" "}
        <button type="button" onClick={() => setOpen(true)} className="font-semibold text-ink underline underline-offset-2">
          Let us know
        </button>
      </p>
    );
  }

  async function decline() {
    setError(null);
    if (!reason) return setError("Please choose a reason.");
    if (preview) return setError("This is a preview - customers decline from their own link.");
    setSaving(true);
    const fullReason = comments.trim() ? `${reason} - ${comments.trim()}` : reason;
    const { data, error: rpcError } = await createClient().rpc("proposal_decline", {
      p_token: token,
      p_name: name.trim(),
      p_reason: fullReason,
      p_declined_to: reason === DECLINE_REASONS[0] ? who.trim() : "",
      p_code: code,
    });
    const result = data as { ok: boolean; error?: string } | null;
    if (rpcError || !result?.ok) {
      setSaving(false);
      return setError(result?.error ?? "Couldn't send that just now - please try again.");
    }
    // Lets the office know (and marks the job lost in the Hub). Never blocks.
    await fetch(`/api/proposals/${token}/declined`, { method: "POST" }).catch(() => {});
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4 print:hidden">
      <p className="font-semibold text-ink">Not going ahead?</p>
      <p className="text-sm text-muted">Thanks for considering us. It helps us a lot to know why.</p>
      <fieldset className="space-y-1">
        {DECLINE_REASONS.map((r) => (
          <label key={r} className="flex min-h-10 items-center gap-2.5">
            <input type="radio" name="decline-reason" checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4" />
            {r}
          </label>
        ))}
      </fieldset>
      {reason === DECLINE_REASONS[0] && (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-ink">Who did you go with? (optional)</span>
          <input className={inputClass} value={who} onChange={(e) => setWho(e.target.value)} />
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-ink">Anything else? (optional)</span>
        <textarea className={inputClass} rows={2} value={comments} onChange={(e) => setComments(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-ink">Your name (optional)</span>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </label>
      {error && (
        <p role="alert" className="text-sm font-medium text-brand-red">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={decline}
          disabled={saving}
          className="min-h-11 rounded-lg border border-border bg-white px-4 font-semibold text-ink hover:bg-background disabled:opacity-60"
        >
          {saving ? "Sending…" : "Decline proposal"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 px-3 text-sm font-medium text-muted hover:underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
