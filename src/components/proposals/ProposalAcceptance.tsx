"use client";

// The customer's side of a proposal: pick options (one per group), type
// their name, draw a signature and accept. Once accepted, shows the record
// instead. Goes through the token-checked proposal_accept function - the
// customer isn't signed in.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { ProposalPricing } from "@/lib/quotes/proposalPricing";
import { money } from "./ProposalDocument";

export type AcceptedRecord = {
  accepted_at: string;
  accepted_name: string;
  accepted_signature: string | null;
  accepted_options: string[] | null;
  accepted_total: number | null;
};

const inputClass =
  "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-base outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red";

export function ProposalAcceptance({
  token,
  pricing,
  accepted,
  preview = false,
}: {
  token: string;
  pricing: ProposalPricing;
  accepted: AcceptedRecord | null;
  // Staff preview: shows the form, but it can't be submitted.
  preview?: boolean;
}) {
  const router = useRouter();
  const groups = useMemo(() => [...new Set(pricing.options.map((o) => o.group))], [pricing.options]);
  // Options chosen: in a group, the one picked; stand-alone, ticked or not.
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total =
    pricing.total + pricing.options.filter((o) => chosen.has(o.key)).reduce((s, o) => s + o.price, 0);

  function pickInGroup(group: string, key: string | null) {
    setChosen((prev) => {
      const next = new Set(prev);
      for (const o of pricing.options) if (o.group === group) next.delete(o.key);
      if (key) next.add(key);
      return next;
    });
  }

  function toggle(key: string, on: boolean) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  async function accept() {
    setError(null);
    if (!name.trim()) return setError("Please type your full name.");
    if (!signature) return setError("Please sign in the box.");
    if (!agree) return setError("Please tick to confirm you accept the terms and conditions.");
    if (preview) return setError("This is a preview - customers accept from their own link.");

    setSaving(true);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("proposal_accept", {
      p_token: token,
      p_name: name.trim(),
      p_signature: signature,
      p_options: [...chosen],
      p_total: total,
      p_user_agent: navigator.userAgent,
    });
    const result = data as { ok: boolean; error?: string } | null;
    if (rpcError || !result?.ok) {
      setSaving(false);
      return setError(result?.error ?? "Couldn't accept just now - please try again.");
    }
    // Lets the office know (and marks the job won in the Hub). Never blocks.
    await fetch(`/api/proposals/${token}/accepted`, { method: "POST" }).catch(() => {});
    setSaving(false);
    router.refresh();
  }

  if (accepted) {
    const picked = pricing.options.filter((o) => accepted.accepted_options?.includes(o.key));
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-green-50 px-4 py-3 font-semibold text-green-800">
          Accepted by {accepted.accepted_name} on{" "}
          {new Date(accepted.accepted_at).toLocaleString("en-NZ", {
            timeZone: "Pacific/Auckland",
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
        {picked.length > 0 && (
          <div>
            <p className="font-semibold text-ink">Options accepted</p>
            <ul className="list-disc pl-5">
              {picked.map((o) => (
                <li key={o.key}>
                  {o.label} – {money(o.price)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {accepted.accepted_total != null && (
          <p>
            <span className="font-semibold text-ink">Total accepted:</span> {money(Number(accepted.accepted_total))} + GST
          </p>
        )}
        {accepted.accepted_signature && (
          <div>
            <p className="text-sm text-muted">Signature</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={accepted.accepted_signature} alt={`Signature of ${accepted.accepted_name}`} className="h-24 w-auto" />
          </div>
        )}
        <p className="text-sm text-muted">Thank you - we&apos;ll be in touch to arrange a start date.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 print:hidden">
      {pricing.options.length > 0 && (
        <div className="space-y-4">
          <p className="font-semibold text-ink">Choose any options you&apos;d like included</p>
          {groups.map((g) => {
            const opts = pricing.options.filter((o) => o.group === g);
            if (g && opts.length > 1) {
              const current = opts.find((o) => chosen.has(o.key))?.key ?? null;
              return (
                <fieldset key={g} className="rounded-lg border border-border p-3">
                  <legend className="px-1 text-sm font-semibold text-ink">{g} – choose one</legend>
                  {opts.map((o, i) => (
                    <label key={o.key} className="flex min-h-11 items-center justify-between gap-3">
                      <span className="flex items-center gap-2.5">
                        <input type="radio" name={`opt-${g}`} checked={current === o.key} onChange={() => pickInGroup(g, o.key)} className="h-4 w-4" />
                        {`Option ${i + 1} – ${o.label}`}
                      </span>
                      <span className="font-medium">{money(o.price)}</span>
                    </label>
                  ))}
                  <label className="flex min-h-11 items-center gap-2.5">
                    <input type="radio" name={`opt-${g}`} checked={current === null} onChange={() => pickInGroup(g, null)} className="h-4 w-4" />
                    None of these
                  </label>
                </fieldset>
              );
            }
            return opts.map((o) => (
              <label key={o.key} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3">
                <span className="flex items-center gap-2.5">
                  <input type="checkbox" checked={chosen.has(o.key)} onChange={(e) => toggle(o.key, e.target.checked)} className="h-4 w-4" />
                  {o.label}
                </span>
                <span className="font-medium">{money(o.price)}</span>
              </label>
            ));
          })}
        </div>
      )}

      <div className="rounded-lg bg-background px-4 py-3">
        <p className="flex justify-between gap-3 text-lg font-semibold text-ink">
          <span>Total</span>
          <span>{money(total)} + GST</span>
        </p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-ink">Full name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <div>
          <span className="mb-1 block text-sm font-semibold text-ink">Signature</span>
          <SignaturePad onChange={setSignature} />
        </div>
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-5 w-5" />
          <span>I have read this proposal and accept it, including the terms and conditions.</span>
        </label>
        {error && (
          <p role="alert" className="text-sm font-medium text-brand-red">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={accept}
          disabled={saving}
          className="min-h-12 w-full rounded-lg bg-brand-red px-5 text-base font-semibold text-white transition hover:bg-brand-red-dark disabled:opacity-60 sm:w-auto"
        >
          {saving ? "Accepting…" : "Accept proposal"}
        </button>
      </div>
    </div>
  );
}

// Draw a signature with a finger or mouse. Reports it as a PNG data URL
// (null when cleared or empty).
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drawn = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Crisp on high-density screens.
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    drawn.current = true;
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    if (drawn.current) onChange(e.currentTarget.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    drawn.current = false;
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="Signature box - sign with your finger or mouse"
        className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-border bg-white"
      />
      <button type="button" onClick={clear} className="mt-1 min-h-10 text-sm font-medium text-brand-red-dark hover:underline">
        Clear signature
      </button>
    </div>
  );
}
