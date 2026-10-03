"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, ExternalLink, ImagePlus, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Field, inputClass } from "@/components/quotes/Modal";
import type { ProposalPricing } from "@/lib/quotes/proposalPricing";
import { proposalImageUrl, money, type ProposalImage, type SpecRow } from "./ProposalDocument";
import { isLockedSection, sectionLabel, type SectionChoice } from "@/lib/quotes/proposalSections";

export type BuilderProposal = {
  id: string | null;
  token: string | null;
  proposal_date: string;
  recipient_name: string | null;
  recipient_company: string | null;
  recipient_address: string | null;
  salutation: string | null;
  subject: string | null;
  site_address: string | null;
  letter: string | null;
  extent_includes: string | null;
  extent_excludes: string | null;
  spec_intro: string | null;
  spec_rows: SpecRow[];
  site_plan: ProposalImage[];
  site_plan_notes: string | null;
  condition_photos: ProposalImage[];
  sections: SectionChoice[];
  pricing_labels: Record<string, string>;
  pricing: ProposalPricing | null;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  total_view_seconds: number;
  accepted_at: string | null;
  accepted_name: string | null;
  accepted_signature: string | null;
  accepted_options: string[] | null;
  accepted_total: number | null;
};
export type ViewRow = { started_at: string; seconds: number };

const textarea = inputClass + " min-h-24 resize-y";
const card = "rounded-xl border border-border bg-surface p-5 shadow-sm";

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return m < 60 ? `${m}m ${seconds % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Applies the typed-over labels to the costing's pricing.
function withLabels(pricing: ProposalPricing, labels: Record<string, string>): ProposalPricing {
  const label = (key: string, fallback: string) => labels[key]?.trim() || fallback;
  return {
    items: pricing.items.map((i) => ({ ...i, label: label(i.key, i.label) })),
    options: pricing.options.map((o) => ({ ...o, label: label(o.key, o.label) })),
    total: pricing.total,
  };
}

export function ProposalBuilder({
  quoteId,
  jobName,
  customerName,
  initial,
  livePricing,
  views,
}: {
  quoteId: string;
  jobName: string;
  customerName: string;
  initial: BuilderProposal;
  livePricing: ProposalPricing;
  views: ViewRow[];
}) {
  const router = useRouter();
  const [p, setP] = useState<BuilderProposal>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"site_plan" | "condition_photos" | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const locked = !!p.accepted_at;

  const set = <K extends keyof BuilderProposal>(key: K, value: BuilderProposal[K]) =>
    setP((prev) => ({ ...prev, [key]: value }));

  const pricing = withLabels(livePricing, p.pricing_labels);
  // The costing changed since the prices were last saved into the proposal.
  const pricesChanged =
    !!p.pricing &&
    JSON.stringify([p.pricing.items.map((i) => [i.key, i.price]), p.pricing.options.map((o) => [o.key, o.price])]) !==
      JSON.stringify([pricing.items.map((i) => [i.key, i.price]), pricing.options.map((o) => [o.key, o.price])]);

  async function save(): Promise<{ id: string; token: string } | null> {
    setMessage(null);
    if (locked) return p.id && p.token ? { id: p.id, token: p.token } : null;
    setSaving(true);
    const supabase = createClient();
    const payload = {
      quote_id: quoteId,
      proposal_date: p.proposal_date,
      recipient_name: p.recipient_name?.trim() || null,
      recipient_company: p.recipient_company?.trim() || null,
      recipient_address: p.recipient_address?.trim() || null,
      salutation: p.salutation?.trim() || null,
      subject: p.subject?.trim() || null,
      site_address: p.site_address?.trim() || null,
      letter: p.letter,
      extent_includes: p.extent_includes,
      extent_excludes: p.extent_excludes,
      spec_intro: p.spec_intro,
      spec_rows: p.spec_rows.filter((r) => r.surface.trim()),
      site_plan: p.site_plan,
      site_plan_notes: p.site_plan_notes,
      condition_photos: p.condition_photos,
      sections: p.sections,
      pricing_labels: p.pricing_labels,
      // Frozen here: what the customer sees until the next save.
      pricing,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("proposals")
      .upsert(payload, { onConflict: "quote_id" })
      .select("id, token")
      .single();
    setSaving(false);
    if (error || !data) {
      setMessage({ kind: "error", text: "Couldn't save — " + (error?.message ?? "try again.") });
      return null;
    }
    setP((prev) => ({ ...prev, id: data.id, token: data.token, pricing }));
    setMessage({ kind: "ok", text: "Saved." });
    router.refresh();
    return data;
  }

  async function copyLink() {
    const saved = await save();
    if (!saved) return;
    const url = `${window.location.origin}/p/${saved.token}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy the customer's link:", url);
    }
    const res = await fetch("/api/proposals/sent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId }),
    });
    const result = await res.json().catch(() => ({}));
    setP((prev) => ({ ...prev, sent_at: new Date().toISOString() }));
    setMessage({
      kind: "ok",
      text: result?.hub?.ok
        ? "Link copied — paste it into your email to the customer. The admins have been emailed a reminder."
        : "Link copied — paste it into your email to the customer. (The Hub reminder email couldn't be sent.)",
    });
  }

  async function preview() {
    const saved = await save();
    if (saved) window.open(`/p/${saved.token}?preview=1`, "_blank", "noopener");
  }

  async function uploadImages(files: FileList | null, key: "site_plan" | "condition_photos") {
    if (!files?.length) return;
    setUploading(key);
    const supabase = createClient();
    const added: ProposalImage[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${key === "site_plan" ? "site-plans" : "condition"}/${quoteId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("proposal-images").upload(path, file, { contentType: file.type });
      if (error) {
        setMessage({ kind: "error", text: "Couldn't upload " + file.name + " — " + error.message });
        continue;
      }
      added.push({ path, caption: "" });
    }
    setUploading(null);
    set(key, [...p[key], ...added]);
  }

  function setSpec(i: number, field: keyof SpecRow, value: string) {
    set(
      "spec_rows",
      p.spec_rows.map((r, j) => (j === i ? { ...r, [field]: value } : r))
    );
  }

  const acceptedOptions = (p.pricing?.options ?? []).filter((o) => p.accepted_options?.includes(o.key));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Proposal</h1>
          <p className="mt-1 text-sm text-muted">
            {customerName} · {jobName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={preview}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-background disabled:opacity-60"
          >
            <ExternalLink className="h-4 w-4" />
            Preview
          </button>
          <button
            onClick={copyLink}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-brand-red px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-red-dark disabled:opacity-60"
          >
            <Copy className="h-4 w-4" />
            Copy link
          </button>
          {!locked && (
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mb-4 rounded-lg px-4 py-2.5 text-sm font-medium ${
            message.kind === "error" ? "bg-red-50 text-brand-red-dark" : "bg-green-50 text-green-800"
          }`}
        >
          {message.text}
        </p>
      )}

      {/* Status */}
      <div className={`${card} mb-5`}>
        <h2 className="mb-3 text-sm font-semibold text-ink">Status</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Link sent</p>
            <p className="font-medium">{p.sent_at ? when(p.sent_at) : "Not yet"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Viewed</p>
            <p className="font-medium">
              {p.view_count > 0
                ? `${p.view_count} time${p.view_count === 1 ? "" : "s"} · ${duration(p.total_view_seconds)}`
                : "Not opened yet"}
            </p>
            {p.last_viewed_at && <p className="text-xs text-muted">Last {when(p.last_viewed_at)}</p>}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Accepted</p>
            <p className={`font-medium ${p.accepted_at ? "text-green-700" : ""}`}>
              {p.accepted_at ? `${p.accepted_name} · ${when(p.accepted_at)}` : "Not yet"}
            </p>
          </div>
        </div>
        {p.accepted_at && (
          <div className="mt-4 border-t border-border pt-3 text-sm">
            {acceptedOptions.length > 0 && (
              <p>
                <span className="font-semibold">Options chosen: </span>
                {acceptedOptions.map((o) => `${o.label} (${money(o.price)})`).join(", ")}
              </p>
            )}
            {p.accepted_total != null && (
              <p>
                <span className="font-semibold">Total accepted: </span>
                {money(Number(p.accepted_total))} + GST
              </p>
            )}
            {p.accepted_signature && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.accepted_signature} alt={`Signature of ${p.accepted_name}`} className="mt-2 h-20 w-auto" />
            )}
            <p className="mt-2 text-xs text-muted">Accepted proposals are locked so the record doesn&apos;t change.</p>
          </div>
        )}
        {views.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-xs font-semibold text-muted">Every time it was opened</summary>
            <ul className="mt-2 space-y-0.5">
              {views.map((v, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{when(v.started_at)}</span>
                  <span className="text-muted">{duration(v.seconds)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <fieldset disabled={locked} className="space-y-5 disabled:opacity-80">
        {/* What's in it */}
        <div className={card}>
          <h2 className="mb-1 text-sm font-semibold text-ink">What&apos;s in this proposal</h2>
          <p className="mb-3 text-xs text-muted">
            Untick what you don&apos;t want and use the arrows to change the order. The cover and acceptance are always included.
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {p.sections.map((c, i) => {
              const fixed = isLockedSection(c.key);
              const move = (to: number) => {
                const next = [...p.sections];
                [next[i], next[to]] = [next[to], next[i]];
                set("sections", next);
              };
              return (
                <li key={c.key} className="flex items-center gap-3 px-3 py-2">
                  <label className={`flex flex-1 items-center gap-2.5 text-sm ${c.on ? "text-ink" : "text-muted line-through"}`}>
                    <input
                      type="checkbox"
                      checked={c.on}
                      disabled={fixed}
                      onChange={(e) => set("sections", p.sections.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
                      className="h-4 w-4 accent-brand-red"
                    />
                    {sectionLabel(c.key)}
                    {fixed && <span className="text-xs text-muted">(always included)</span>}
                  </label>
                  <button type="button" onClick={() => move(i - 1)} disabled={i === 0} aria-label="Move up" className="rounded-md p-1 text-muted hover:text-ink disabled:opacity-30">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => move(i + 1)} disabled={i === p.sections.length - 1} aria-label="Move down" className="rounded-md p-1 text-muted hover:text-ink disabled:opacity-30">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Equipment straight after the site plan, and Why Platinum Painters straight after the pricing, share that page.
          </p>
        </div>

        {/* Letter */}
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-ink">Cover and letter</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Site address (cover page)">
              <textarea className={textarea} value={p.site_address ?? ""} onChange={(e) => set("site_address", e.target.value)} placeholder={"3 Wallingford Street\nGrey Lynn\nAuckland"} />
            </Field>
            <Field label="Date">
              <input type="date" className={inputClass} value={p.proposal_date} onChange={(e) => set("proposal_date", e.target.value)} />
            </Field>
            <Field label="To (contact name)">
              <input className={inputClass} value={p.recipient_name ?? ""} onChange={(e) => set("recipient_name", e.target.value)} placeholder="Emma Hallberg" />
            </Field>
            <Field label="Company">
              <input className={inputClass} value={p.recipient_company ?? ""} onChange={(e) => set("recipient_company", e.target.value)} />
            </Field>
            <Field label="Postal address">
              <textarea className={textarea} value={p.recipient_address ?? ""} onChange={(e) => set("recipient_address", e.target.value)} />
            </Field>
            <Field label="Greeting">
              <input
                className={inputClass}
                value={p.salutation ?? ""}
                onChange={(e) => set("salutation", e.target.value)}
                placeholder={`Dear ${p.recipient_name?.split(" ")[0] || "Sir/Madam"},`}
              />
            </Field>
            <Field label="Subject (bold, under the greeting)">
              <input
                className={inputClass}
                value={p.subject ?? ""}
                onChange={(e) => set("subject", e.target.value)}
                placeholder="e.g. EXTERIOR PAINTING"
              />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Letter">
              <textarea className={inputClass + " min-h-48 resize-y"} value={p.letter ?? ""} onChange={(e) => set("letter", e.target.value)} />
            </Field>
            <p className="mt-1 text-xs text-muted">Blank lines start a new paragraph. Your sign-off is added from Proposal templates.</p>
          </div>
        </div>

        {/* Extent of work */}
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-ink">Extent of work</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Surfaces included (one per line)">
              <textarea className={inputClass + " min-h-40 resize-y"} value={p.extent_includes ?? ""} onChange={(e) => set("extent_includes", e.target.value)} />
            </Field>
            <Field label="Exclusions (one per line)">
              <textarea className={inputClass + " min-h-40 resize-y"} value={p.extent_excludes ?? ""} onChange={(e) => set("extent_excludes", e.target.value)} />
            </Field>
          </div>
        </div>

        {/* Specification */}
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-ink">Specification</h2>
          <Field label="Introduction">
            <textarea className={textarea} value={p.spec_intro ?? ""} onChange={(e) => set("spec_intro", e.target.value)} />
          </Field>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-2">Surface</th>
                  <th className="py-1.5 pr-2">Spot prime</th>
                  <th className="py-1.5 pr-2">1st coat</th>
                  <th className="py-1.5 pr-2">2nd coat</th>
                  <th className="py-1.5 pr-2">3rd coat</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {p.spec_rows.map((r, i) => (
                  <tr key={i}>
                    {(["surface", "prime", "coat1", "coat2", "coat3"] as const).map((f) => (
                      <td key={f} className="py-1 pr-2">
                        <input className={inputClass + " w-full"} value={r[f]} onChange={(e) => setSpec(i, f, e.target.value)} />
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        onClick={() => set("spec_rows", p.spec_rows.filter((_, j) => j !== i))}
                        aria-label="Remove row"
                        className="rounded-md p-1.5 text-muted hover:text-brand-red"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => set("spec_rows", [...p.spec_rows, { surface: "", prime: "", coat1: "", coat2: "", coat3: "" }])}
            className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-brand-red-dark hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add row
          </button>
        </div>

        {/* Current condition */}
        <div className={card}>
          <h2 className="mb-1 text-sm font-semibold text-ink">Current condition</h2>
          <p className="mb-3 text-xs text-muted">Photos from the site visit, each with what you&apos;ll do about it. Six to a page, after Completed Projects.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {p.condition_photos.map((img, i) => (
              <div key={img.path} className="rounded-lg border border-border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={proposalImageUrl(img.path)} alt="" className="aspect-[4/3] w-full rounded object-cover" />
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className={inputClass + " flex-1"}
                    value={img.caption ?? ""}
                    onChange={(e) =>
                      set(
                        "condition_photos",
                        p.condition_photos.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x))
                      )
                    }
                    placeholder="e.g. Rusty nails will be punched and zinc coated"
                  />
                  <button
                    type="button"
                    onClick={() => set("condition_photos", p.condition_photos.filter((_, j) => j !== i))}
                    aria-label="Remove photo"
                    className="rounded-md p-1.5 text-muted hover:text-brand-red"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-ink hover:bg-background">
            <ImagePlus className="h-4 w-4" />
            {uploading === "condition_photos" ? "Uploading…" : "Add condition photos"}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { uploadImages(e.target.files, "condition_photos"); e.target.value = ""; }} />
          </label>
        </div>

        {/* Site plan */}
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold text-ink">Site plan</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {p.site_plan.map((img, i) => (
              <div key={img.path} className="rounded-lg border border-border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={proposalImageUrl(img.path)} alt="" className="w-full rounded" />
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className={inputClass + " flex-1"}
                    value={img.caption ?? ""}
                    onChange={(e) =>
                      set(
                        "site_plan",
                        p.site_plan.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x))
                      )
                    }
                    placeholder="Caption"
                  />
                  <button
                    type="button"
                    onClick={() => set("site_plan", p.site_plan.filter((_, j) => j !== i))}
                    aria-label="Remove image"
                    className="rounded-md p-1.5 text-muted hover:text-brand-red"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-ink hover:bg-background">
            <ImagePlus className="h-4 w-4" />
            {uploading === "site_plan" ? "Uploading…" : "Add site plan image"}
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { uploadImages(e.target.files, "site_plan"); e.target.value = ""; }} />
          </label>
          <div className="mt-3">
            <Field label="Notes (e.g. what the colours mean)">
              <textarea className={textarea} value={p.site_plan_notes ?? ""} onChange={(e) => set("site_plan_notes", e.target.value)} placeholder={"Red lines = building to be painted\nYellow lines = neighbouring side of walls excluded"} />
            </Field>
          </div>
        </div>

        {/* Pricing */}
        <div className={card}>
          <h2 className="mb-1 text-sm font-semibold text-ink">Pricing</h2>
          <p className="mb-3 text-xs text-muted">
            From the costing (Negotiating Factor applied, rounded to the dollar, excl. GST). Change the wording the customer sees if you like.
          </p>
          {pricesChanged && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
              The costing has changed since this proposal was saved — Save to update the prices the customer sees.
            </p>
          )}
          <div className="space-y-2">
            {pricing.items.map((l) => (
              <div key={l.key} className="flex items-center gap-3">
                <input
                  className={inputClass + " flex-1"}
                  value={p.pricing_labels[l.key] ?? l.label}
                  onChange={(e) => set("pricing_labels", { ...p.pricing_labels, [l.key]: e.target.value })}
                />
                <span className="w-28 text-right font-medium">{money(l.price)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Total</span>
              <span>{money(pricing.total)} + GST</span>
            </div>
          </div>
          {pricing.options.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Options</p>
              {pricing.options.map((o) => (
                <div key={o.key} className="flex items-center gap-3">
                  <input
                    className={inputClass + " flex-1"}
                    value={p.pricing_labels[o.key] ?? o.label}
                    onChange={(e) => set("pricing_labels", { ...p.pricing_labels, [o.key]: e.target.value })}
                  />
                  {o.group && <span className="text-xs text-muted">{o.group}</span>}
                  <span className="w-28 text-right font-medium">{money(o.price)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            Methodology, terms and completed-projects photos come from Costing → Proposal templates.
          </p>
        </div>
      </fieldset>

      {!locked && (
        <div className="mt-5 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save proposal"}
          </button>
        </div>
      )}
    </div>
  );
}
