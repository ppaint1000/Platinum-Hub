"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Field, inputClass } from "@/components/quotes/Modal";
import { proposalImageUrl, type ProposalImage } from "./ProposalDocument";
import type { ProposalTemplates } from "@/lib/quotes/proposalDefaults";

export type Templates = ProposalTemplates;

const card = "rounded-xl border border-border bg-surface p-5 shadow-sm";
const big = inputClass + " min-h-64 resize-y";

async function uploadImages(files: FileList, folder: string): Promise<{ added: ProposalImage[]; error: string | null }> {
  const supabase = createClient();
  const added: ProposalImage[] = [];
  let error: string | null = null;
  for (const file of Array.from(files)) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: e } = await supabase.storage.from("proposal-images").upload(path, file, { contentType: file.type });
    if (e) {
      error = `Couldn't upload ${file.name} — ${e.message}`;
      continue;
    }
    added.push({ path, caption: "" });
  }
  return { added, error };
}

// A list of pictures with optional captions: add, caption, remove.
function ImageList({
  images,
  onChange,
  folder,
  captions = true,
  placeholder,
  addLabel,
  aspect = "aspect-[4/3]",
  onError,
}: {
  images: ProposalImage[];
  onChange: (images: ProposalImage[]) => void;
  folder: string;
  captions?: boolean;
  placeholder?: string;
  addLabel: string;
  aspect?: string;
  onError: (text: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {images.map((img, i) => (
          <div key={img.path} className="rounded-lg border border-border p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proposalImageUrl(img.path)} alt="" className={`${aspect} w-full rounded object-cover`} />
            <div className="mt-2 flex items-center gap-2">
              {captions ? (
                <input
                  className={inputClass + " flex-1"}
                  value={img.caption ?? ""}
                  onChange={(e) => onChange(images.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))}
                  placeholder={placeholder}
                />
              ) : (
                <span className="flex-1" />
              )}
              <button
                type="button"
                onClick={() => onChange(images.filter((_, j) => j !== i))}
                aria-label="Remove picture"
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
        {uploading ? "Uploading…" : addLabel}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={async (e) => {
            const files = e.target.files;
            e.target.value = "";
            if (!files?.length) return;
            setUploading(true);
            const { added, error } = await uploadImages(files, folder);
            setUploading(false);
            if (error) onError(error);
            onChange([...images, ...added]);
          }}
        />
      </label>
    </>
  );
}

export function ProposalTemplatesClient({ initial, neverSaved }: { initial: Templates; neverSaved: boolean }) {
  const router = useRouter();
  const [t, setT] = useState<Templates>(initial);
  const [saving, setSaving] = useState(false);
  const [sigUploading, setSigUploading] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const set = <K extends keyof Templates>(key: K, value: Templates[K]) => setT((prev) => ({ ...prev, [key]: value }));
  const onError = (text: string) => setMessage({ kind: "error", text });

  async function save() {
    setSaving(true);
    setMessage(null);
    const { error } = await createClient()
      .from("proposal_settings")
      .upsert({ id: true, ...t, updated_at: new Date().toISOString() }, { onConflict: "id" });
    setSaving(false);
    setMessage(error ? { kind: "error", text: "Couldn't save — " + error.message } : { kind: "ok", text: "Saved." });
    if (!error) router.refresh();
  }

  const saveButton = (big = false) => (
    <button
      onClick={save}
      disabled={saving}
      className={`rounded-lg bg-ink font-semibold text-white transition hover:bg-black disabled:opacity-60 ${big ? "px-5 py-2.5 text-sm" : "px-4 py-2 text-sm"}`}
    >
      {saving ? "Saving…" : "Save templates"}
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Proposal templates</h1>
          <p className="mt-1 text-sm text-muted">
            Used on every proposal. Blank lines start a new paragraph; a line ending in &ldquo;:&rdquo; is a heading.
          </p>
        </div>
        {saveButton()}
      </div>

      {neverSaved && (
        <p className="rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          These start with the wording and pictures from your printed proposals. Check them over and click Save
          templates.
        </p>
      )}
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`rounded-lg px-4 py-2.5 text-sm font-medium ${message.kind === "error" ? "bg-red-50 text-brand-red-dark" : "bg-green-50 text-green-800"}`}
        >
          {message.text}
        </p>
      )}

      <div className={card}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cover title">
            <input className={inputClass} value={t.cover_title} onChange={(e) => set("cover_title", e.target.value)} />
          </Field>
          <Field label="Red band at the bottom of every page">
            <input className={inputClass} value={t.header_line} onChange={(e) => set("header_line", e.target.value)} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted">Put two spaces between the parts of the bottom band to spread them across the page.</p>
      </div>

      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold text-ink">Letter</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Red banner at the top">
            <input className={inputClass} value={t.letter_banner} onChange={(e) => set("letter_banner", e.target.value)} />
          </Field>
          <Field label="Company address (grey box, top right)">
            <textarea className={inputClass + " min-h-24 resize-y"} value={t.company_block} onChange={(e) => set("company_block", e.target.value)} />
          </Field>
          <Field label="Standard letter (each proposal starts with this)">
            <textarea className={big} value={t.letter_intro} onChange={(e) => set("letter_intro", e.target.value)} />
          </Field>
          <div className="space-y-3">
            <Field label="Sign-off (above the signature)">
              <textarea className={inputClass + " min-h-20 resize-y"} value={t.signoff} onChange={(e) => set("signoff", e.target.value)} />
            </Field>
            <Field label="Signature">
              <div className="flex flex-wrap items-center gap-3">
                {t.signature_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proposalImageUrl(t.signature_path)} alt="Signature" className="h-14 w-auto rounded border border-border bg-white p-1" />
                ) : (
                  <span className="text-sm text-muted">No signature</span>
                )}
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-ink hover:bg-background">
                  <ImagePlus className="h-4 w-4" />
                  {sigUploading ? "Uploading…" : "Change"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files;
                      e.target.value = "";
                      if (!files?.length) return;
                      setSigUploading(true);
                      const { added, error } = await uploadImages(files, "signatures");
                      setSigUploading(false);
                      if (error) onError(error);
                      if (added[0]) set("signature_path", added[0].path);
                    }}
                  />
                </label>
                {t.signature_path && (
                  <button type="button" onClick={() => set("signature_path", "")} className="text-sm font-medium text-brand-red-dark hover:underline">
                    Remove
                  </button>
                )}
              </div>
            </Field>
            <Field label="Name and title (under the signature)">
              <textarea className={inputClass + " min-h-16 resize-y"} value={t.signer} onChange={(e) => set("signer", e.target.value)} />
            </Field>
          </div>
        </div>
      </div>

      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold text-ink">Completed projects</h2>
        <ImageList
          images={t.completed_projects}
          onChange={(v) => set("completed_projects", v)}
          folder="completed-projects"
          placeholder="e.g. Body Corporate Complex – Exterior repaint"
          addLabel="Add photos"
          onError={onError}
        />
        <div className="mt-3">
          <Field label="About us (under the photos, optional)">
            <textarea className={inputClass + " min-h-24 resize-y"} value={t.about_text} onChange={(e) => set("about_text", e.target.value)} />
          </Field>
        </div>
      </div>

      <div className={card}>
        <h2 className="mb-1 text-sm font-semibold text-ink">Reference photos</h2>
        <p className="mb-3 text-xs text-muted">
          Your library of photos (past jobs, finishes, colours...). On each proposal, tick the ones to show in its Reference photos section.
        </p>
        <ImageList
          images={t.reference_photos}
          onChange={(v) => set("reference_photos", v)}
          folder="reference-photos"
          placeholder="e.g. Weatherboard villa - Resene Alabaster"
          addLabel="Add reference photos"
          onError={onError}
        />
      </div>

      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold text-ink">Equipment (under the site plan)</h2>
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          <Field label="Heading">
            <input className={inputClass} value={t.equipment_title} onChange={(e) => set("equipment_title", e.target.value)} />
          </Field>
          <Field label="Red caption under the photos">
            <input className={inputClass} value={t.equipment_caption} onChange={(e) => set("equipment_caption", e.target.value)} />
          </Field>
        </div>
        <ImageList
          images={t.equipment_photos}
          onChange={(v) => set("equipment_photos", v)}
          folder="equipment"
          captions={false}
          addLabel="Add equipment photos"
          onError={onError}
        />
      </div>

      <div className={card}>
        <Field label="Methodology">
          <textarea className={big} value={t.methodology} onChange={(e) => set("methodology", e.target.value)} />
        </Field>
      </div>

      <div className={card}>
        <Field label="Why Platinum Painters (under the pricing)">
          <textarea className={inputClass + " min-h-40 resize-y"} value={t.why_text} onChange={(e) => set("why_text", e.target.value)} />
        </Field>
        <p className="mt-2 text-xs text-muted">Lines starting 1. 2. 3. make a numbered list. Leave it empty to leave it off.</p>
      </div>

      <div className={card}>
        <Field label="Terms and conditions">
          <textarea className={big} value={t.terms} onChange={(e) => set("terms", e.target.value)} />
        </Field>
      </div>

      <div className={card}>
        <h2 className="mb-1 text-sm font-semibold text-ink">Pages at the back</h2>
        <p className="mb-3 text-sm text-muted">
          Whole pages after the terms, e.g. your Resene Eco Decorator certificate. Swap it here when the new one arrives.
        </p>
        <ImageList
          images={t.back_pages}
          onChange={(v) => set("back_pages", v)}
          folder="back-pages"
          placeholder="What it is (not shown on the proposal)"
          addLabel="Add a page"
          aspect="aspect-[3/4]"
          onError={onError}
        />
      </div>

      <div className="flex justify-end">{saveButton(true)}</div>
    </div>
  );
}
