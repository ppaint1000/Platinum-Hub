"use client";

import { useState } from "react";
import Link from "next/link";
import { createClientAction } from "@/app/clients/actions";
import { Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";

export type ClientRow = {
  id: string;
  name: string;
  notes: string | null;
  client_contacts: { count: number }[];
};

export function ClientsList({ clients }: { clients: ClientRow[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await createClientAction({ name, notes });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setName("");
    setNotes("");
    setOpen(false);
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setOpen((v) => !v)}>{open ? "Cancel" : "Add client"}</Button>
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-3 border-b border-line pb-6">
          <div>
            <label className="block text-sm font-medium text-ink">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
            />
          </div>
          {error && (
            <p className="text-sm" style={{ color: overBudgetColor }}>
              {error}
            </p>
          )}
          <div>
            <Button type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add client"}
            </Button>
          </div>
        </form>
      )}

      {clients.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-soft">No clients yet.</p>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="flex items-center justify-between border border-line bg-paper-raised px-4 py-3 hover:bg-accent-soft/40"
            >
              <div>
                <div className="font-medium text-ink">{c.name}</div>
                {c.notes && <div className="text-sm text-ink-soft">{c.notes}</div>}
              </div>
              <span className="text-sm text-ink-soft">
                {c.client_contacts?.[0]?.count ?? 0} contact
                {(c.client_contacts?.[0]?.count ?? 0) === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
