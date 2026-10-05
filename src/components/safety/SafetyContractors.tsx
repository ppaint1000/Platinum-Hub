"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { archiveContractorAction, saveContractorAction, type ContractorInput } from "@/app/safety/actions";
import { card, input, primaryBtn, secondaryBtn } from "./styles";

export type ContractorRow = {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  trades: string | null;
  prequal_status: "not_started" | "requested" | "approved" | "declined";
  prequal_expires_on: string | null;
  insurance_expires_on: string | null;
  notes: string | null;
  archived: boolean;
};

const PREQUAL = [
  { value: "not_started", label: "Not started" },
  { value: "requested", label: "Requested" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
];

const blank: ContractorInput = {
  company: "",
  contactName: "",
  email: "",
  phone: "",
  trades: "",
  prequalStatus: "not_started",
  prequalExpiresOn: "",
  insuranceExpiresOn: "",
  notes: "",
};

const fmt = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function SafetyContractors({ rows, today }: { rows: ContractorRow[]; today: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ContractorInput | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10);
  const shown = rows.filter((r) => showArchived || !r.archived);

  // Needs attention: not approved, or pre-qual / insurance expired or expiring within 30 days.
  function attention(r: ContractorRow): string | null {
    if (r.archived) return null;
    if (r.prequal_status !== "approved") return "Pre-qual not approved";
    for (const [label, d] of [["Pre-qual", r.prequal_expires_on], ["Insurance", r.insurance_expires_on]] as const) {
      if (d && d < today) return `${label} expired`;
      if (d && d <= soon) return `${label} expires ${fmt(d)}`;
    }
    return null;
  }

  function act(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  const field = (key: keyof ContractorInput, label: string, type = "text") => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold">{label}</span>
      <input type={type} className={input} value={editing?.[key] ?? ""} onChange={(e) => setEditing((c) => (c ? { ...c, [key]: e.target.value } : c))} />
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-[#5B6472]">Subbies and their health &amp; safety: pre-qualification and insurance, flagged 30 days before they run out.</p>
        <button type="button" onClick={() => setEditing({ ...blank })} className={`${primaryBtn} ml-auto`}>
          <Plus className="h-4 w-4" /> Add contractor
        </button>
      </div>

      {editing && (
        <div className={`${card} grid gap-3 p-4 sm:grid-cols-2`}>
          {field("company", "Company")}
          {field("trades", "Trades (e.g. scaffolding, plastering)")}
          {field("contactName", "Contact name")}
          {field("phone", "Phone")}
          {field("email", "Email", "email")}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Pre-qualification</span>
            <select className={input} value={editing.prequalStatus} onChange={(e) => setEditing({ ...editing, prequalStatus: e.target.value })}>
              {PREQUAL.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {field("prequalExpiresOn", "Pre-qual expires", "date")}
          {field("insuranceExpiresOn", "Insurance expires", "date")}
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">Notes</span>
            <textarea className={input} rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" disabled={pending} onClick={() => act(() => saveContractorAction(editing), () => setEditing(null))} className={primaryBtn}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className={secondaryBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}

      <div className={`${card} overflow-x-auto`}>
        {shown.length === 0 ? (
          <p className="p-6 text-sm text-[#5B6472]">No contractors yet.</p>
        ) : (
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-[#E3E1DA] bg-[#F8F7F3] text-xs uppercase tracking-wide text-[#5B6472]">
              <tr>
                <th className="px-4 py-2">Company</th>
                <th className="px-4 py-2">Contact</th>
                <th className="px-4 py-2">Pre-qual</th>
                <th className="px-4 py-2">Insurance</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEDE7]">
              {shown.map((r) => {
                const flag = attention(r);
                return (
                  <tr key={r.id} className={r.archived ? "opacity-50" : ""}>
                    <td className="px-4 py-2.5 align-top">
                      <span className="font-semibold">{r.company}</span>
                      {r.trades && <span className="block text-[#5B6472]">{r.trades}</span>}
                      {flag && <span className="mt-1 inline-block rounded-full bg-[#B91C1C] px-2.5 py-0.5 text-xs font-semibold text-white">{flag}</span>}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {r.contact_name}
                      {r.phone && <span className="block text-[#5B6472]">{r.phone}</span>}
                      {r.email && <span className="block text-[#5B6472]">{r.email}</span>}
                    </td>
                    <td className="px-4 py-2.5 align-top">
                      {PREQUAL.find((p) => p.value === r.prequal_status)?.label}
                      {r.prequal_expires_on && <span className="block text-[#5B6472]">to {fmt(r.prequal_expires_on)}</span>}
                    </td>
                    <td className="px-4 py-2.5 align-top">{r.insurance_expires_on ? `to ${fmt(r.insurance_expires_on)}` : "—"}</td>
                    <td className="px-4 py-2.5 text-right align-top whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            id: r.id,
                            company: r.company,
                            contactName: r.contact_name ?? "",
                            email: r.email ?? "",
                            phone: r.phone ?? "",
                            trades: r.trades ?? "",
                            prequalStatus: r.prequal_status,
                            prequalExpiresOn: r.prequal_expires_on ?? "",
                            insuranceExpiresOn: r.insurance_expires_on ?? "",
                            notes: r.notes ?? "",
                          })
                        }
                        className="font-semibold text-[#1F4E8C] hover:underline"
                      >
                        Edit
                      </button>
                      <button type="button" disabled={pending} onClick={() => act(() => archiveContractorAction(r.id, !r.archived))} className="ml-3 font-semibold text-[#5B6472] hover:underline">
                        {r.archived ? "Bring back" : "Archive"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {rows.some((r) => r.archived) && (
        <button type="button" onClick={() => setShowArchived((v) => !v)} className="self-start text-sm font-semibold text-[#1F4E8C] hover:underline">
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
      )}
    </div>
  );
}
