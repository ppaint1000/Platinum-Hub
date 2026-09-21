"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Panel } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { createJobAction } from "@/app/jobs/actions";

type ClientOption = { id: string; name: string };
type LeadOption = { id: string; name: string };

export function AddJobButton({
  clients,
  leadOptions,
}: {
  clients: ClientOption[];
  leadOptions: LeadOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [quotedSellTotal, setQuotedSellTotal] = useState("");
  const [quotedHours, setQuotedHours] = useState("");
  const [leadByUserId, setLeadByUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await createJobAction({
      name,
      description,
      clientId,
      quotedSellTotal: quotedSellTotal === "" ? null : Number(quotedSellTotal),
      quotedHours: quotedHours === "" ? null : Number(quotedHours),
      leadByUserId,
    });

    if (result.error) {
      setSaving(false);
      setError(result.error);
      return;
    }
    // Land straight on the new job — that's where budget lines get added.
    router.push(`/jobs/${result.jobId}`);
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        New job
      </Button>
    );
  }

  return (
    <Panel className="mb-6 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">
        Add a job assessed by hand
      </h2>
      <p className="mb-4 text-sm text-ink-soft">
        For a job you&apos;ve priced yourself rather than one that came through a Measures quote.
        It starts as &ldquo;Quoted&rdquo; — add budget lines once it&apos;s created.
      </p>
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
          <span className="text-ink-soft">Client</span>
          <select
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="rounded border border-line px-2 py-1.5"
          >
            <option value="" disabled>
              Choose a client…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-ink-soft">Description</span>
          <textarea
            required
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded border border-line px-2 py-1.5"
          />
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
          <span className="text-ink-soft">Quoted by</span>
          <select
            required
            value={leadByUserId}
            onChange={(e) => setLeadByUserId(e.target.value)}
            className="rounded border border-line px-2 py-1.5"
          >
            <option value="" disabled>
              Choose a sales person…
            </option>
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
            {saving ? "Creating…" : "Create job"}
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
