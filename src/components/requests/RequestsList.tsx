"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { convertRequestAction, createRequestAction, updateRequestAction, type RequestInput } from "@/app/requests/actions";
import { Card } from "@/components/dashboard/parts";
import type { McOwner } from "@/lib/quotes/mcAccess";

export type RequestRow = {
  id: string;
  created_at: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  message: string | null;
  source: string;
  status: "new" | "contacted" | "converted" | "declined";
  owner_id: string | null;
  client_id: string | null;
  site_measure_id: string | null;
  notes: string | null;
};

const TABS = [
  { key: "open", label: "To do" },
  { key: "converted", label: "Became a site measure" },
  { key: "declined", label: "Declined" },
  { key: "all", label: "All" },
] as const;

const SOURCES: { value: RequestInput["source"]; label: string }[] = [
  { value: "phone", label: "Phone call" },
  { value: "email", label: "Email" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Other" },
];

const STATUS = {
  new: { label: "New", cls: "bg-[#FDECEC] text-[#B91C1C]" },
  contacted: { label: "Contacted", cls: "bg-[#E3ECF8] text-[#163A69]" },
  converted: { label: "Site measure made", cls: "bg-green-50 text-green-800" },
  declined: { label: "Declined", cls: "bg-[#ECEAE3] text-[#3F4753]" },
} as const;

const input = "w-full rounded-lg border border-[#E3E1DA] bg-white px-3 py-2 text-sm text-[#16202E]";
const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", timeZone: "Pacific/Auckland" });

export function RequestsList({
  rows,
  clients,
  owners,
}: {
  rows: RequestRow[];
  clients: { id: string; name: string }[];
  // Admins only: who a request can be given to.
  owners: McOwner[] | null;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("open");
  const [adding, setAdding] = useState(false);
  // "+ New → Request" in the top bar opens the form straight away (?new=1).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (new URLSearchParams(window.location.search).has("new")) setAdding(true);
  }, []);

  const shown = rows.filter((r) =>
    tab === "all" ? true : tab === "open" ? r.status === "new" || r.status === "contacted" : r.status === tab
  );
  const ownerName = new Map((owners ?? []).map((o) => [o.id, o.name]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist">
          {TABS.map((t) => {
            const n =
              t.key === "all"
                ? rows.length
                : t.key === "open"
                  ? rows.filter((r) => r.status === "new" || r.status === "contacted").length
                  : rows.filter((r) => r.status === t.key).length;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                  tab === t.key ? "bg-[#1F4E8C] text-white" : "border border-[#E3E1DA] bg-white text-[#16202E] hover:bg-[#F5F4F0]"
                }`}
              >
                {t.label} ({n})
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-[#1F4E8C] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#163A69]"
        >
          <Plus className="h-4 w-4" />
          New request
        </button>
      </div>

      {adding && <NewRequest owners={owners} onDone={() => setAdding(false)} />}

      {shown.length === 0 ? (
        <Card className="p-6 text-sm text-[#5B6472]">
          {tab === "open" ? "Nothing to do - every enquiry has been dealt with." : "None here."}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((r) => (
            <RequestCard key={r.id} r={r} clients={clients} owners={owners} ownerName={ownerName.get(r.owner_id ?? "") ?? null} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewRequest({ owners, onDone }: { owners: McOwner[] | null; onDone: () => void }) {
  const [f, setF] = useState<RequestInput>({
    name: "",
    company: "",
    email: "",
    phone: "",
    address: "",
    message: "",
    source: "phone",
    ownerId: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const set = (k: keyof RequestInput, v: string | null) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Card className="p-4">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await createRequestAction(f);
            if (res.error) setError(res.error);
            else onDone();
          });
        }}
      >
        <label className="text-sm font-medium">
          Name *
          <input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Company / body corporate
          <input className={input} value={f.company} onChange={(e) => set("company", e.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Phone
          <input className={input} value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Email
          <input className={input} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Address of the job
          <input className={input} value={f.address} onChange={(e) => set("address", e.target.value)} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          What they&apos;re after
          <textarea className={`${input} min-h-20`} value={f.message} onChange={(e) => set("message", e.target.value)} />
        </label>
        <label className="text-sm font-medium">
          How they got in touch
          <select className={input} value={f.source} onChange={(e) => set("source", e.target.value)}>
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {owners && (
          <label className="text-sm font-medium">
            Give it to
            <select className={input} value={f.ownerId ?? ""} onChange={(e) => set("ownerId", e.target.value || null)}>
              <option value="">Me</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="text-sm text-[#B91C1C] sm:col-span-2">{error}</p>}
        <div className="flex gap-2 sm:col-span-2">
          <button type="submit" disabled={saving} className="rounded-lg bg-[#1F4E8C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? "Saving…" : "Add request"}
          </button>
          <button type="button" onClick={onDone} className="rounded-lg border border-[#E3E1DA] bg-white px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}

function RequestCard({
  r,
  clients,
  owners,
  ownerName,
}: {
  r: RequestRow;
  clients: { id: string; name: string }[];
  owners: McOwner[] | null;
  ownerName: string | null;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [converting, setConverting] = useState(false);
  // An existing client with the same name, if there is one.
  const match = clients.find((c) => c.name.trim().toLowerCase() === (r.company || r.name).trim().toLowerCase());
  const [clientId, setClientId] = useState(match?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const s = STATUS[r.status];

  function update(changes: { status?: string; ownerId?: string | null }) {
    start(async () => {
      const res = await updateRequestAction(r.id, changes);
      if (res.error) setError(res.error);
    });
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[#16202E]">
            {r.name}
            {r.company && <span className="font-normal text-[#5B6472]"> · {r.company}</span>}
          </p>
          <p className="text-sm text-[#5B6472]">
            {[r.phone, r.email].filter(Boolean).join(" · ") || "No contact details"}
          </p>
          {r.address && <p className="text-sm text-[#3F4753]">{r.address}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-0.5 font-semibold ${s.cls}`}>{s.label}</span>
          <span className="text-[#5B6472]">
            {fmt(r.created_at)} · {SOURCES.find((x) => x.value === r.source)?.label ?? r.source}
          </span>
        </div>
      </div>
      {r.message && <p className="mt-2 whitespace-pre-wrap text-sm text-[#3F4753]">{r.message}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#EFEDE7] pt-3 text-sm">
        {owners ? (
          <select
            aria-label="Who it's given to"
            value={r.owner_id ?? ""}
            disabled={busy}
            onChange={(e) => update({ ownerId: e.target.value || null })}
            className="rounded-lg border border-[#E3E1DA] bg-white px-2 py-1.5"
          >
            <option value="">Not given to anyone</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[#5B6472]">{ownerName ?? (r.owner_id ? "Yours" : "Not given to anyone yet")}</span>
        )}

        {r.status === "converted" && r.site_measure_id ? (
          <Link href="/site-measures" className="ml-auto font-semibold text-[#1F4E8C] hover:underline">
            Open Site Measures →
          </Link>
        ) : (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {r.status === "new" && (
              <button type="button" disabled={busy} onClick={() => update({ status: "contacted" })} className="rounded-lg border border-[#E3E1DA] bg-white px-3 py-1.5 font-semibold hover:bg-[#F5F4F0]">
                Mark contacted
              </button>
            )}
            {r.status !== "declined" ? (
              <button type="button" disabled={busy} onClick={() => update({ status: "declined" })} className="rounded-lg border border-[#E3E1DA] bg-white px-3 py-1.5 font-semibold text-[#5B6472] hover:bg-[#F5F4F0]">
                Decline
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => update({ status: "new" })} className="rounded-lg border border-[#E3E1DA] bg-white px-3 py-1.5 font-semibold hover:bg-[#F5F4F0]">
                Reopen
              </button>
            )}
            {r.status !== "declined" && (
              <button type="button" disabled={busy} onClick={() => setConverting((v) => !v)} className="rounded-lg bg-[#1F4E8C] px-3 py-1.5 font-semibold text-white hover:bg-[#163A69]">
                Make a site measure
              </button>
            )}
          </div>
        )}
      </div>

      {converting && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-[#F5F4F0] p-3 text-sm">
          <label className="min-w-56 flex-1">
            Client
            <select className={input} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">New client: {r.company || r.name}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const res = await convertRequestAction(r.id, clientId || null);
                if (res.error) return setError(res.error);
                router.push("/site-measures");
              })
            }
            className="rounded-lg bg-[#1F4E8C] px-4 py-2 font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Making it…" : "Make the site measure"}
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-[#B91C1C]">{error}</p>}
    </Card>
  );
}
