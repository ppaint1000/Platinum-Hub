"use client";

// Settings → Proposal templates: how long a proposal is valid after it's
// sent, and when the customer is sent a reminder.
import { useState, useTransition } from "react";
import { saveProposalTimingAction } from "@/app/settings/(setup)/proposal-templates/actions";
import { inputClass } from "@/components/quotes/Modal";

export function ProposalTimingSettings({ validDays, reminderDays }: { validDays: number; reminderDays: number }) {
  const [valid, setValid] = useState(String(validDays));
  const [remind, setRemind] = useState(String(reminderDays));
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setStatus(null);
    start(async () => {
      const r = await saveProposalTimingAction(Number(valid), Number(remind));
      setStatus(r.error ? `Couldn't save - ${r.error}` : "Saved.");
    });
  }

  return (
    <section className="mb-6 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold text-ink">Expiry and customer reminder</h2>
      <p className="mt-1 text-sm text-muted">
        Counted from when the proposal link is copied to send. After it expires the customer can&apos;t accept it online until
        you copy the link again.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink">Valid for (days)</span>
          <input type="number" min="0" className={inputClass + " w-28"} value={valid} onChange={(e) => setValid(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-ink">Remind the customer after (days)</span>
          <input type="number" min="0" className={inputClass + " w-28"} value={remind} onChange={(e) => setRemind(e.target.value)} />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-brand-red px-4 py-2 font-semibold text-white hover:bg-brand-red-dark disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {status && <span className="text-muted">{status}</span>}
      </div>
      <p className="mt-2 text-xs text-muted">
        0 = never expires / no reminder. The reminder goes once, to the email on the client&apos;s page, if they haven&apos;t accepted
        or declined.
      </p>
    </section>
  );
}
