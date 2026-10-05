"use client";

// The client's automatic emails (Drips): a main switch, and a tick box for
// each automation - so one client can get the proposal follow-ups but not,
// say, the Google review request. Unsubscribing from an email turns the
// main switch off.
import { useState, useTransition } from "react";
import Link from "next/link";
import { setClientAutoEmailsAction } from "@/app/clients/actions";

const AUTOMATIONS = [
  { trigger: "request_created", label: "New enquiry follow-up" },
  { trigger: "proposal_sent", label: "Proposal follow-up" },
  { trigger: "job_paid", label: "Google review request" },
  { trigger: "job_lost", label: "Lost quote check-in" },
];

export function AutoEmailsToggle({ clientId, enabled, off }: { clientId: string; enabled: boolean; off: string[] }) {
  const [on, setOn] = useState(enabled);
  const [offList, setOffList] = useState(off);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(nextOn: boolean, nextOff: string[]) {
    const [prevOn, prevOff] = [on, offList];
    setOn(nextOn);
    setOffList(nextOff);
    setError(null);
    start(async () => {
      const r = await setClientAutoEmailsAction(clientId, nextOn, nextOff);
      if (r.error) {
        setOn(prevOn);
        setOffList(prevOff);
        setError(r.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-start gap-3 border-b border-line py-3 text-sm">
      <span className="w-32 shrink-0 text-ink-soft">Automatic emails</span>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 font-semibold">
          <input type="checkbox" className="h-4 w-4" checked={on} disabled={pending} onChange={(e) => save(e.target.checked, offList)} />
          {on ? "On" : "Off - this client gets no automatic emails"}
          <Link href="/drips" className="ml-1 font-semibold text-accent hover:underline">
            Drips
          </Link>
        </label>
        {AUTOMATIONS.map((a) => (
          <label key={a.trigger} className={`ml-6 flex items-center gap-2 ${on ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={on && !offList.includes(a.trigger)}
              disabled={pending || !on}
              onChange={(e) =>
                save(on, e.target.checked ? offList.filter((t) => t !== a.trigger) : [...offList, a.trigger])
              }
            />
            {a.label}
          </label>
        ))}
        {error && <span className="text-brand-red">{error}</span>}
      </div>
    </div>
  );
}
