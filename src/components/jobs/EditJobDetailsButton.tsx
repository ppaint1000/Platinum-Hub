"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Panel } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { updateJobCoreDetailsAction } from "@/app/jobs/actions";

type ClientOption = { id: string; name: string };
type LeadOption = { id: string; name: string };

export function EditJobDetailsButton({
  jobId,
  initial,
  clients,
  leadOptions,
}: {
  jobId: string;
  initial: {
    name: string;
    description: string | null;
    clientId: string | null;
    quotedSellTotal: number | null;
    quotedHours: number | null;
    leadBy: string | null;
    leadByUserId: string | null;
  };
  clients: ClientOption[];
  leadOptions: LeadOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? "");
  const [clientId, setClientId] = useState(initial.clientId ?? "");
  const [quotedSellTotal, setQuotedSellTotal] = useState(
    initial.quotedSellTotal != null ? String(initial.quotedSellTotal) : ""
  );
  const [quotedHours, setQuotedHours] = useState(
    initial.quotedHours != null ? String(initial.quotedHours) : ""
  );
  const [leadByUserId, setLeadByUserId] = useState(initial.leadByUserId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await updateJobCoreDetailsAction(jobId, {
      name,
      description,
      clientId: clientId || null,
      quotedSellTotal: quotedSellTotal === "" ? null : Number(quotedSellTotal),
      quotedHours: quotedHours === "" ? null : Number(quotedHours),
      leadByUserId: leadByUserId || null,
    });

    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Edit details
      </Button>
    );
  }

  return (
    <Panel className="mb-6 p-4">
      <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-ink-soft">Job name</span>
          <input
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-line px-2 py-1.5"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-ink-soft">Description</span>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded border border-line px-2 py-1.5"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-ink-soft">Client</span>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded border border-line px-2 py-1.5"
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-soft">Quoted $ total</span>
          <input
            type="number"
            step="0.01"
            value={quotedSellTotal}
            onChange={(e) => setQuotedSellTotal(e.target.value)}
            className="no-spinner rounded border border-line px-2 py-1.5"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-soft">Quoted hours</span>
          <input
            type="number"
            step="0.01"
            value={quotedHours}
            onChange={(e) => setQuotedHours(e.target.value)}
            className="no-spinner rounded border border-line px-2 py-1.5"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-ink-soft">
            Lead by
            {initial.leadBy && !initial.leadByUserId && (
              <span className="text-ink-faint"> (was &ldquo;{initial.leadBy}&rdquo; — pick who that is)</span>
            )}
          </span>
          <select
            value={leadByUserId}
            onChange={(e) => setLeadByUserId(e.target.value)}
            className="rounded border border-line px-2 py-1.5"
          >
            <option value="">No one set</option>
            {leadOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p className="text-sm sm:col-span-2" style={{ color: overBudgetColor }}>
            {error}
          </p>
        )}

        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Panel>
  );
}
