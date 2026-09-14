"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  updateClientAction,
  deleteClientAction,
  createContactAction,
  updateContactAction,
  deleteContactAction,
} from "@/app/clients/actions";
import { Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";

export type ClientDetailRow = { id: string; name: string; notes: string | null };
export type ContactRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  job_id: string | null;
};
export type JobOption = { id: string; job_number: string | null; name: string };

export function ClientDetail({
  client,
  contacts,
  jobs,
}: {
  client: ClientDetailRow;
  contacts: ContactRow[];
  jobs: JobOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(client.name);
  const [notes, setNotes] = useState(client.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveClient() {
    setSaving(true);
    setError(null);
    const result = await updateClientAction(client.id, { name, notes });
    setSaving(false);
    if (result.error) setError(result.error);
  }

  async function handleDeleteClient() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    const result = await deleteClientAction(client.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/clients");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-ink">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={handleDeleteClient}
            style={{ color: overBudgetColor }}
            className="mt-6 text-sm font-medium hover:underline"
          >
            {confirmingDelete ? "Confirm delete" : "Delete client"}
          </button>
        </div>
        <div className="mt-3">
          <label className="block text-sm font-medium text-ink">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
          />
        </div>
        {error && (
          <p className="mt-2 text-sm" style={{ color: overBudgetColor }}>
            {error}
          </p>
        )}
        <div className="mt-3">
          <Button onClick={saveClient} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="border-t border-line pt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-faint">Contacts</h2>
        <ContactsList clientId={client.id} contacts={contacts} jobs={jobs} />
      </div>
    </div>
  );
}

function jobLabel(job: JobOption) {
  return job.job_number ? `${job.job_number} — ${job.name}` : job.name;
}

function ProjectSelect({
  jobs,
  value,
  onChange,
}: {
  jobs: JobOption[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-line px-2 py-1 text-sm text-ink"
    >
      <option value="">No project</option>
      {jobs.map((j) => (
        <option key={j.id} value={j.id}>
          {jobLabel(j)}
        </option>
      ))}
    </select>
  );
}

function ContactsList({
  clientId,
  contacts,
  jobs,
}: {
  clientId: string;
  contacts: ContactRow[];
  jobs: JobOption[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-2">
      {contacts.map((c) => (
        <ContactRowItem key={c.id} clientId={clientId} contact={c} jobs={jobs} />
      ))}

      {adding ? (
        <NewContactForm clientId={clientId} jobs={jobs} onDone={() => setAdding(false)} />
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          Add contact
        </Button>
      )}
    </div>
  );
}

function ContactRowItem({
  clientId,
  contact,
  jobs,
}: {
  clientId: string;
  contact: ContactRow;
  jobs: JobOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [jobId, setJobId] = useState(contact.job_id ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    setSaving(true);
    const result = await updateContactAction(contact.id, clientId, {
      name,
      email,
      phone,
      jobId: jobId || null,
    });
    setSaving(false);
    if (!result.error) setEditing(false);
  }

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    await deleteContactAction(contact.id, clientId);
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 border border-line bg-paper-raised p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="rounded border border-line px-2 py-1 text-sm"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="rounded border border-line px-2 py-1 text-sm"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
          className="rounded border border-line px-2 py-1 text-sm"
        />
        <ProjectSelect jobs={jobs} value={jobId} onChange={setJobId} />
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  const contactJob = jobs.find((j) => j.id === contact.job_id);

  return (
    <div className="flex items-center justify-between border border-line bg-paper-raised px-3 py-2">
      <div className="text-sm">
        <span className="font-medium text-ink">{contact.name}</span>
        {contact.email && <span className="ml-3 text-ink-soft">{contact.email}</span>}
        {contact.phone && <span className="ml-3 text-ink-soft">{contact.phone}</span>}
        {contactJob && <span className="ml-3 text-ink-faint">{jobLabel(contactJob)}</span>}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm font-medium text-accent hover:text-accent-hover"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleDelete}
          style={{ color: overBudgetColor }}
          className="text-sm font-medium hover:underline"
        >
          {confirmingDelete ? "Confirm" : "Delete"}
        </button>
      </div>
    </div>
  );
}

function NewContactForm({
  clientId,
  jobs,
  onDone,
}: {
  clientId: string;
  jobs: JobOption[];
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobId, setJobId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await createContactAction(clientId, { name, email, phone, jobId: jobId || null });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2 border border-line bg-paper-raised p-3">
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="rounded border border-line px-2 py-1 text-sm"
      />
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="rounded border border-line px-2 py-1 text-sm"
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone"
        className="rounded border border-line px-2 py-1 text-sm"
      />
      <ProjectSelect jobs={jobs} value={jobId} onChange={setJobId} />
      <Button type="submit" disabled={saving}>
        {saving ? "Adding…" : "Add"}
      </Button>
      <Button variant="secondary" onClick={onDone}>
        Cancel
      </Button>
      {error && (
        <p className="w-full text-sm" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}
    </form>
  );
}
