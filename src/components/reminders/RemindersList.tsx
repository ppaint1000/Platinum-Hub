"use client";

// The Reminders page: what's due, what's coming up, and what's been sent,
// plus adding one by hand and when the automatic ones fall.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  addReminderAction,
  changeReminderDateAction,
  saveReminderSettingsAction,
  setReminderStatusAction,
  type ReminderInput,
} from "@/app/reminders/actions";
import { Card } from "@/components/dashboard/parts";

export type ReminderRow = {
  id: string;
  kind: "maintenance" | "repaint" | "other";
  due_on: string;
  note: string | null;
  email_customer: boolean;
  status: "pending" | "sent" | "done" | "cancelled";
  sent_at: string | null;
  client: { id: string; name: string; email: string | null } | null;
  job: { id: string; name: string } | null;
};

const KIND = {
  maintenance: { label: "Check-up", cls: "bg-[#E3ECF8] text-[#163A69]" },
  repaint: { label: "Repaint", cls: "bg-[#FDF0E1] text-[#9A3412]" },
  other: { label: "Other", cls: "bg-[#ECEAE3] text-[#3F4753]" },
} as const;

const input = "w-full rounded-lg border border-[#E3E1DA] bg-white px-3 py-2 text-sm text-[#16202E]";
const fmt = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export function RemindersList({
  rows,
  clients,
  today,
  clientFilter,
  maintenanceMonths,
  repaintYears,
}: {
  rows: ReminderRow[];
  clients: { id: string; name: string }[];
  today: string;
  clientFilter: string | null;
  maintenanceMonths: number;
  repaintYears: number;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = clientFilter ? rows.filter((r) => r.client?.id === clientFilter) : rows;
  const soon = addDays(today, 90);
  const groups = [
    { title: "Sent - follow up with a call", items: shown.filter((r) => r.status === "sent") },
    { title: "Due in the next 3 months", items: shown.filter((r) => r.status === "pending" && r.due_on <= soon) },
    { title: "Later", items: shown.filter((r) => r.status === "pending" && r.due_on > soon) },
    { title: "Done or cancelled", items: shown.filter((r) => r.status === "done" || r.status === "cancelled").reverse() },
  ];

  function act(fn: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-[#5B6472]">
          A check-up and a repaint reminder are added for the client whenever a job is completed. When one comes round, the
          customer is emailed (if ticked) and you&apos;re told, so you can follow up.
        </p>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-[#1F4E8C] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#183E70]"
        >
          <Plus className="h-4 w-4" /> Add a reminder
        </button>
      </div>

      {clientFilter && (
        <p className="text-sm">
          Showing one client.{" "}
          <Link href="/reminders" className="font-semibold text-[#1F4E8C] underline">
            Show all
          </Link>
        </p>
      )}

      {adding && (
        <AddForm
          clients={clients}
          defaultClient={clientFilter ?? ""}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}

      {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}

      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.title} className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">
                {g.title} <span className="text-sm font-normal text-[#5B6472]">({g.items.length})</span>
              </h2>
              <Card>
                <ul className="divide-y divide-[#EFEDE7]">
                  {g.items.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
                      <span className="w-28 shrink-0 font-semibold">{fmt(r.due_on)}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${KIND[r.kind].cls}`}>{KIND[r.kind].label}</span>
                      <span className="min-w-0 flex-1">
                        {r.client ? (
                          <Link href={`/clients/${r.client.id}`} className="font-semibold text-[#1F4E8C] hover:underline">
                            {r.client.name}
                          </Link>
                        ) : (
                          "Client removed"
                        )}
                        {r.job && <span className="text-[#5B6472]"> · {r.job.name}</span>}
                        {r.note && <span className="block text-[#5B6472]">{r.note}</span>}
                        <span className="block text-xs text-[#8A919C]">
                          {r.status === "sent"
                            ? r.email_customer && r.client?.email
                              ? "Customer emailed"
                              : "Not emailed - call them"
                            : r.email_customer
                              ? r.client?.email
                                ? "Customer will be emailed"
                                : "No email address - you'll be told to call"
                              : "Not emailed - you'll be told"}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {(r.status === "pending" || r.status === "sent") && (
                          <>
                            <input
                              type="date"
                              aria-label="Change the date"
                              defaultValue={r.due_on}
                              onChange={(e) => e.target.value && act(() => changeReminderDateAction(r.id, e.target.value))}
                              className="rounded-lg border border-[#E3E1DA] px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => act(() => setReminderStatusAction(r.id, "done"))}
                              className="rounded-lg border border-[#E3E1DA] px-2.5 py-1 text-xs font-semibold hover:bg-[#F5F4F0]"
                            >
                              Done
                            </button>
                            {r.status === "pending" && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => act(() => setReminderStatusAction(r.id, "cancelled"))}
                                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[#B91C1C] hover:bg-[#FDECEC]"
                              >
                                Cancel
                              </button>
                            )}
                          </>
                        )}
                        {(r.status === "done" || r.status === "cancelled") && (
                          <span className="text-xs text-[#5B6472]">{r.status === "done" ? "Done" : "Cancelled"}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )
      )}

      {shown.length === 0 && <p className="text-sm text-[#5B6472]">No reminders yet - they&apos;re added as jobs are completed.</p>}

      <TimingSettings maintenanceMonths={maintenanceMonths} repaintYears={repaintYears} />
    </div>
  );
}

function AddForm({ clients, defaultClient, onDone }: { clients: { id: string; name: string }[]; defaultClient: string; onDone: () => void }) {
  const [f, setF] = useState<ReminderInput>({ clientId: defaultClient, kind: "maintenance", dueOn: "", note: "", emailCustomer: true });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (p: Partial<ReminderInput>) => setF((x) => ({ ...x, ...p }));

  return (
    <Card className="p-4">
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Client</span>
          <select className={input} value={f.clientId} onChange={(e) => set({ clientId: e.target.value })}>
            <option value="">Choose…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Type</span>
          <select className={input} value={f.kind} onChange={(e) => set({ kind: e.target.value as ReminderInput["kind"] })}>
            <option value="maintenance">Check-up</option>
            <option value="repaint">Repaint</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">When</span>
          <input type="date" className={input} value={f.dueOn} onChange={(e) => set({ dueOn: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Note {f.kind === "other" ? "(goes in the customer's email)" : "(for you)"}</span>
          <input className={input} value={f.note} onChange={(e) => set({ note: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" checked={f.emailCustomer} onChange={(e) => set({ emailCustomer: e.target.checked })} />
          Email the customer when it&apos;s due
        </label>
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-[#B91C1C]">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await addReminderAction(f);
            if (r.error) setError(r.error);
            else onDone();
          })
        }
        className="mt-3 rounded-lg bg-[#1F4E8C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#183E70] disabled:opacity-60"
      >
        {pending ? "Saving…" : "Add reminder"}
      </button>
    </Card>
  );
}

function TimingSettings({ maintenanceMonths, repaintYears }: { maintenanceMonths: number; repaintYears: number }) {
  const [m, setM] = useState(String(maintenanceMonths));
  const [y, setY] = useState(String(repaintYears));
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card className="p-4">
      <h2 className="font-semibold">When a job is completed, add</h2>
      <div className="mt-3 flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col gap-1">
          <span>A check-up after (months)</span>
          <input type="number" min="0" className={input + " w-28"} value={m} onChange={(e) => setM(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span>A repaint reminder after (years)</span>
          <input type="number" min="0" className={input + " w-28"} value={y} onChange={(e) => setY(e.target.value)} />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveReminderSettingsAction(Number(m), Number(y));
              setStatus(r.error ? `Couldn't save - ${r.error}` : "Saved.");
            })
          }
          className="rounded-lg border border-[#E3E1DA] px-4 py-2 font-semibold hover:bg-[#F5F4F0]"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {status && <span className="text-[#5B6472]">{status}</span>}
      </div>
      <p className="mt-2 text-xs text-[#8A919C]">0 = don&apos;t add that one. Changes apply to jobs completed from now on.</p>
    </Card>
  );
}
