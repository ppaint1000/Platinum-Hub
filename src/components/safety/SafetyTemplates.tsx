"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SAFETY_TEMPLATES, TEMPLATE_GROUPS, type SafetyTemplate } from "@/lib/safety/templates";
import { addDocumentAction, deleteDocumentAction, documentLinkAction } from "@/app/safety/actions";
import { card } from "./styles";

export type TemplateFile = { id: string; name: string; template_key: string | null };

export function SafetyTemplates({ files, canManage }: { files: TemplateFile[]; canManage: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = SAFETY_TEMPLATES.filter((t) => !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-[#5B6472]">
          Health &amp; safety templates. &quot;In the Hub&quot; ones are filled in here; the others have their form file attached once it&apos;s uploaded.
        </p>
        <input
          className="ml-auto w-full rounded-lg border border-[#D9D6CC] bg-white px-3 py-2 text-sm sm:w-64"
          placeholder="Search templates"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}

      {TEMPLATE_GROUPS.map((g) => {
        const items = shown.filter((t) => t.group === g);
        if (!items.length) return null;
        return (
          <section key={g} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{g}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((t) => (
                <TemplateCard
                  key={t.key}
                  t={t}
                  files={files.filter((f) => f.template_key === t.key)}
                  canManage={canManage}
                  onError={setError}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TemplateCard({
  t,
  files,
  canManage,
  onError,
}: {
  t: SafetyTemplate;
  files: TemplateFile[];
  canManage: boolean;
  onError: (e: string | null) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();

  async function upload(file: File) {
    onError(null);
    if (file.size > 50 * 1024 * 1024) return onError("That file is over 50 MB.");
    setBusy(true);
    const path = `template/${t.key}-${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await createClient().storage.from("safety-documents").upload(path, file, { contentType: file.type || undefined });
    if (error) {
      setBusy(false);
      return onError(error.message);
    }
    const r = await addDocumentAction({ name: file.name, category: "template", path, templateKey: t.key });
    setBusy(false);
    if (r.error) return onError(r.error);
    router.refresh();
  }

  return (
    <div className={`${card} flex flex-col gap-2 p-4`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{t.name}</p>
        {t.hubHref ? (
          <span className="shrink-0 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-800">In the Hub</span>
        ) : files.length === 0 ? (
          <span className="shrink-0 rounded-full bg-[#ECEAE3] px-2.5 py-0.5 text-xs font-semibold text-[#3F4753]">Form to come</span>
        ) : null}
      </div>
      <p className="text-sm text-[#5B6472]">{t.description}</p>
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-sm">
        {t.hubHref && (
          <Link href={t.hubHref} className="font-semibold text-[#1F4E8C] hover:underline">
            Open in the Hub
          </Link>
        )}
        {files.map((f) => (
          <span key={f.id} className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await documentLinkAction(f.id);
                  if (r.url) window.open(r.url, "_blank", "noopener");
                  else onError(r.error ?? "Couldn't open it.");
                })
              }
              className="flex items-center gap-1 font-semibold text-[#1F4E8C] hover:underline"
            >
              <FileText className="h-4 w-4" /> {f.name}
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() =>
                  confirm(`Remove "${f.name}"?`) &&
                  start(async () => {
                    const r = await deleteDocumentAction(f.id);
                    if (r.error) onError(r.error);
                    else router.refresh();
                  })
                }
                className="text-xs font-semibold text-[#B91C1C] hover:underline"
              >
                Remove
              </button>
            )}
          </span>
        ))}
        {canManage && (
          <label className="flex cursor-pointer items-center gap-1 font-semibold text-[#5B6472] hover:text-[#16202E]">
            <Upload className="h-4 w-4" />
            {busy ? "Uploading…" : files.length ? "Upload another" : "Upload the form"}
            <input
              type="file"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) upload(file);
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
