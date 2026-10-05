"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DOC_CATEGORIES } from "@/lib/safety/forms";
import { addDocumentAction, deleteDocumentAction, documentLinkAction } from "@/app/safety/actions";
import { card, input, primaryBtn } from "./styles";

export type DocRow = { id: string; name: string; category: string; created_at: string };

export function SafetyDocuments({ rows, canManage }: { rows: DocRow[]; canManage: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();

  async function upload() {
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a file.");
    if (file.size > 50 * 1024 * 1024) return setError("That file is over 50 MB.");
    setBusy(true);
    const path = `${category}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error: upErr } = await createClient().storage.from("safety-documents").upload(path, file, { contentType: file.type || undefined });
    if (upErr) {
      setBusy(false);
      return setError(upErr.message);
    }
    const r = await addDocumentAction({ name: name || file.name, category, path });
    setBusy(false);
    if (r.error) return setError(r.error);
    setName("");
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  function open(id: string) {
    start(async () => {
      const r = await documentLinkAction(id);
      if (r.url) window.open(r.url, "_blank", "noopener");
      else setError(r.error ?? "Couldn't open it.");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[#5B6472]">Health &amp; safety documents for the team - policy, emergency plan, safety data sheets, procedures.</p>

      {canManage && (
        <div className={`${card} grid gap-3 p-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end`}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">File</span>
            <input ref={fileRef} type="file" className="text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Name (optional)</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Type</span>
            <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
              {DOC_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={upload} disabled={busy} className={primaryBtn}>
            <Upload className="h-4 w-4" /> {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      )}

      {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}

      {rows.length === 0 ? (
        <div className={card}>
          <p className="p-6 text-sm text-[#5B6472]">No documents yet.</p>
        </div>
      ) : (
        DOC_CATEGORIES.filter((c) => rows.some((r) => r.category === c.value)).map((c) => (
          <section key={c.value} className="flex flex-col gap-2">
            <h2 className="font-semibold">{c.label}</h2>
            <ul className={`${card} divide-y divide-[#EFEDE7]`}>
              {rows
                .filter((r) => r.category === c.value)
                .map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-[#5B6472]" />
                    <button type="button" disabled={pending} onClick={() => open(d.id)} className="min-w-0 flex-1 truncate text-left font-semibold text-[#1F4E8C] hover:underline">
                      {d.name}
                    </button>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() =>
                          confirm(`Remove "${d.name}"?`) &&
                          start(async () => {
                            const r = await deleteDocumentAction(d.id);
                            if (r.error) setError(r.error);
                            else router.refresh();
                          })
                        }
                        className="text-xs font-semibold text-[#B91C1C] hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
