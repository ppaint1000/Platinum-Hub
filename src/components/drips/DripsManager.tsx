"use client";

// The Drips page: the Google review link and pause switch, each automatic
// sequence (on/off, and its emails - wait, subject and message), who's on
// one right now, and the last emails sent.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { saveDripSettingsAction, saveStepsAction, setSequenceActiveAction, stopEnrolmentAction, type StepInput } from "@/app/drips/actions";
import { Card } from "@/components/dashboard/parts";

export type DripData = {
  reviewUrl: string;
  paused: boolean;
  sequences: {
    id: string;
    trigger: string;
    name: string;
    description: string | null;
    active: boolean;
    steps: { id: string; step_order: number; delay_days: number; subject: string; body: string }[];
  }[];
  active: { id: string; sequence_id: string; email: string; name: string | null; next_step: number; next_send_at: string | null }[];
  sends: { id: string; to_email: string; subject: string; sent: boolean; error: string | null; sent_at: string }[];
};

const PLACEHOLDERS = ["{first_name}", "{job}", "{proposal_link}", "{proposal_code}", "{review_link}", "{phone}"];
const input = "w-full rounded-lg border border-[#D9D6CC] bg-white px-3 py-2 text-sm text-[#16202E]";
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-NZ", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland" }) : "—";

export function DripsManager({ data }: { data: DripData }) {
  const router = useRouter();
  const [review, setReview] = useState(data.reviewUrl);
  const [paused, setPaused] = useState(data.paused);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const seqName = new Map(data.sequences.map((s) => [s.id, s.name]));

  function act(fn: () => Promise<{ error?: string }>, ok?: string) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.error ?? ok ?? null);
      if (!r.error) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-[#5B6472]">
        Automatic emails to customers at each stage, like DripJobs. Each email goes a set number of days after the one before, and a
        sequence stops by itself when it no longer applies (e.g. they accept the proposal). Every email has an unsubscribe link, and
        each client can be turned off on their Clients page.
      </p>

      <Card className="grid gap-4 p-4 md:grid-cols-[2fr,1fr] md:items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Your Google review link</span>
          <input className={input} value={review} onChange={(e) => setReview(e.target.value)} placeholder="https://g.page/r/.../review" />
          <span className="text-xs text-[#5B6472]">
            From your Google Business Profile: &quot;Ask for reviews&quot; → copy the link. Used for {"{review_link}"} - review emails
            aren&apos;t sent until it&apos;s set.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
            Pause all automatic emails
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => act(() => saveDripSettingsAction(review, paused), "Saved.")}
            className="rounded-lg bg-[#1F4E8C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#183E70] disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </Card>
      {msg && <p className={`text-sm font-semibold ${msg === "Saved." ? "text-green-700" : "text-[#B91C1C]"}`}>{msg}</p>}

      {data.sequences.map((s) => (
        <SequenceCard key={s.id} seq={s} onAct={act} pending={pending} />
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">On a sequence now ({data.active.length})</h2>
        <Card>
          {data.active.length === 0 ? (
            <p className="p-4 text-sm text-[#5B6472]">Nobody yet - customers are added as enquiries come in, proposals go out and jobs are paid.</p>
          ) : (
            <ul className="divide-y divide-[#EFEDE7]">
              {data.active.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{e.name || e.email}</span> <span className="text-[#5B6472]">{e.email}</span>
                    <span className="block text-xs text-[#5B6472]">
                      {seqName.get(e.sequence_id)} · email {e.next_step + 1} due {when(e.next_send_at)}
                    </span>
                  </span>
                  <button type="button" onClick={() => act(() => stopEnrolmentAction(e.id))} className="text-xs font-semibold text-[#B91C1C] hover:underline">
                    Stop
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Recently sent</h2>
        <Card>
          {data.sends.length === 0 ? (
            <p className="p-4 text-sm text-[#5B6472]">Nothing sent yet.</p>
          ) : (
            <ul className="divide-y divide-[#EFEDE7]">
              {data.sends.map((s) => (
                <li key={s.id} className="flex flex-wrap gap-x-4 px-4 py-2 text-sm">
                  <span className="w-32 shrink-0 text-[#5B6472]">{when(s.sent_at)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {s.subject} <span className="text-[#5B6472]">→ {s.to_email}</span>
                  </span>
                  <span className={s.sent ? "text-green-700" : "font-semibold text-[#B91C1C]"}>{s.sent ? "Sent" : s.error ?? "Not sent"}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function SequenceCard({
  seq,
  onAct,
  pending,
}: {
  seq: DripData["sequences"][number];
  onAct: (fn: () => Promise<{ error?: string }>, ok?: string) => void;
  pending: boolean;
}) {
  const [steps, setSteps] = useState<StepInput[]>(
    seq.steps.map((t) => ({ id: t.id, delayDays: t.delay_days, subject: t.subject, body: t.body }))
  );
  const [open, setOpen] = useState(false);
  const set = (i: number, patch: Partial<StepInput>) => setSteps((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{seq.name}</p>
          <p className="text-sm text-[#5B6472]">
            {seq.description} · {steps.length} email{steps.length === 1 ? "" : "s"}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={seq.active} disabled={pending} onChange={(e) => onAct(() => setSequenceActiveAction(seq.id, e.target.checked))} />
          {seq.active ? "On" : "Off"}
        </label>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-sm font-semibold text-[#1F4E8C] hover:underline">
          {open ? "Close" : "Edit emails"}
        </button>
      </div>

      {open && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-xs text-[#5B6472]">You can use: {PLACEHOLDERS.join("  ")}</p>
          {steps.map((s, i) => (
            <div key={s.id ?? `new-${i}`} className="flex flex-col gap-2 rounded-lg border border-[#E3E1DA] bg-[#FAFAF8] p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold">Email {i + 1}</span>
                <span className="text-[#5B6472]">sent</span>
                <input
                  type="number"
                  min="0"
                  className="w-20 rounded-lg border border-[#D9D6CC] bg-white px-2 py-1 text-sm"
                  value={s.delayDays}
                  onChange={(e) => set(i, { delayDays: Number(e.target.value) })}
                />
                <span className="text-[#5B6472]">days {i === 0 ? "after it starts" : "after the one before"}</span>
                <button
                  type="button"
                  aria-label={`Remove email ${i + 1}`}
                  onClick={() => setSteps((list) => list.filter((_, j) => j !== i))}
                  className="ml-auto rounded-lg p-1.5 text-[#5B6472] hover:text-[#B91C1C]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <input className={input} value={s.subject} onChange={(e) => set(i, { subject: e.target.value })} placeholder="Subject" />
              <textarea className={input} rows={6} value={s.body} onChange={(e) => set(i, { body: e.target.value })} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSteps((list) => [...list, { delayDays: 3, subject: "", body: "" }])}
              className="inline-flex items-center gap-1 rounded-lg border border-[#D9D6CC] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#F5F4F0]"
            >
              <Plus className="h-4 w-4" /> Add an email
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => onAct(() => saveStepsAction(seq.id, steps), "Saved.")}
              className="rounded-lg bg-[#1F4E8C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#183E70] disabled:opacity-60"
            >
              Save emails
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
