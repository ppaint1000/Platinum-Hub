"use client";

// Add, rename, reorder and remove the items on the Pre-job and Post-job
// checklists. Changes apply to every job straight away.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  addChecklistItemAction,
  moveChecklistItemAction,
  removeChecklistItemAction,
  renameChecklistItemAction,
} from "@/app/production/actions";
import { CHECKLIST_NAMES, type ChecklistItem, type ChecklistKind } from "@/lib/jobs/checklists";
import { BLUE, RED, Card } from "@/components/dashboard/parts";

const WHEN: Record<ChecklistKind, string> = {
  pre: "Before a job starts. Moving a job to In progress asks first if it isn't finished.",
  post: "Before a job is finished. Moving a job to Job completed asks first if it isn't finished.",
};

export function ChecklistEditor({ items }: { items: ChecklistItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState<Record<ChecklistKind, string>>({ pre: "", post: "" });
  const [editing, setEditing] = useState<{ id: string; label: string } | null>(null);

  async function run(fn: () => Promise<{ error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (result.error) setError(result.error);
    else router.refresh();
    return !result.error;
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="text-sm font-semibold" style={{ color: RED }} role="alert">
          {error}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        {(["pre", "post"] as const).map((kind) => {
          const list = items.filter((i) => i.checklist === kind);
          return (
            <Card key={kind} className="overflow-hidden">
              <div className="border-b border-[#EFEDE7] bg-[#F5F4F0] px-4 py-3">
                <h2 className="font-semibold text-[#16202E]">{CHECKLIST_NAMES[kind]}</h2>
                <p className="text-xs text-[#5B6472]">{WHEN[kind]}</p>
              </div>
              <ul className="divide-y divide-[#EFEDE7]">
                {list.map((i, idx) => (
                  <li key={i.id} className="flex items-center gap-2 px-4 py-2.5">
                    {editing?.id === i.id ? (
                      <form
                        className="flex flex-1 gap-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (await run(() => renameChecklistItemAction(i.id, editing.label))) setEditing(null);
                        }}
                      >
                        <input
                          autoFocus
                          value={editing.label}
                          onChange={(e) => setEditing({ id: i.id, label: e.target.value })}
                          className="flex-1 rounded-lg border border-[#E3E1DA] px-2 py-1 text-sm"
                        />
                        <button type="submit" disabled={busy} className="rounded-lg px-3 py-1 text-sm font-semibold text-white" style={{ background: BLUE }}>
                          Save
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className="text-sm text-[#5B6472]">
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditing({ id: i.id, label: i.label })}
                          className="flex-1 text-left text-sm text-[#16202E] hover:underline"
                          title="Rename"
                        >
                          {i.label}
                        </button>
                        <button type="button" disabled={busy || idx === 0} onClick={() => run(() => moveChecklistItemAction(i.id, "up"))} aria-label={`Move ${i.label} up`} className="rounded p-1 text-[#5B6472] hover:bg-[#F5F4F0] disabled:opacity-30">
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button type="button" disabled={busy || idx === list.length - 1} onClick={() => run(() => moveChecklistItemAction(i.id, "down"))} aria-label={`Move ${i.label} down`} className="rounded p-1 text-[#5B6472] hover:bg-[#F5F4F0] disabled:opacity-30">
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => window.confirm(`Take "${i.label}" off the ${CHECKLIST_NAMES[kind].toLowerCase()}?`) && run(() => removeChecklistItemAction(i.id))}
                          aria-label={`Remove ${i.label}`}
                          className="rounded p-1 hover:bg-[#F5F4F0]"
                          style={{ color: RED }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </li>
                ))}
                {list.length === 0 && <li className="px-4 py-3 text-sm text-[#5B6472]">No items yet.</li>}
              </ul>
              <form
                className="flex gap-2 border-t border-[#EFEDE7] px-4 py-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await run(() => addChecklistItemAction(kind, newLabel[kind]))) setNewLabel((n) => ({ ...n, [kind]: "" }));
                }}
              >
                <input
                  value={newLabel[kind]}
                  onChange={(e) => setNewLabel((n) => ({ ...n, [kind]: e.target.value }))}
                  placeholder="Add an item…"
                  aria-label={`Add an item to the ${CHECKLIST_NAMES[kind].toLowerCase()}`}
                  className="flex-1 rounded-lg border border-[#E3E1DA] px-3 py-1.5 text-sm"
                />
                <button type="submit" disabled={busy || !newLabel[kind].trim()} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: BLUE }}>
                  <Plus className="h-4 w-4" /> Add
                </button>
              </form>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
