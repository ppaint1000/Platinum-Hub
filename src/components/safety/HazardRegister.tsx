"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { RISK_LEVELS } from "@/lib/safety/forms";
import { saveHazardAction, setHazardActiveAction, type HazardInput } from "@/app/safety/actions";
import { RiskPill } from "./ReportView";
import { card, input, primaryBtn, secondaryBtn } from "./styles";

export type HazardRow = {
  id: string;
  hazard: string;
  harm: string | null;
  risk_before: string | null;
  controls: string | null;
  risk_after: string | null;
  responsible: string | null;
  review_on: string | null;
  active: boolean;
};

// A painter's usual hazards, to start the register off.
const STARTERS: HazardInput[] = [
  { hazard: "Working at height (ladders, scaffold, roofs)", harm: "Falls - serious injury", riskBefore: "extreme", controls: "Ladders in good condition, footed and tied off; scaffold tagged; harness where needed; edge protection", riskAfter: "medium", responsible: "Supervisor", reviewOn: "" },
  { hazard: "Paints, solvents and thinners", harm: "Breathing in fumes, skin and eye irritation, fire", riskBefore: "high", controls: "SDS on site; good ventilation; respirator and gloves; stored closed away from heat", riskAfter: "low", responsible: "All painters", reviewOn: "" },
  { hazard: "Lead-based paint on older buildings", harm: "Lead poisoning from dust", riskBefore: "high", controls: "Test before sanding; wet sanding / dust extraction; P2 mask; drop sheets; clean up with HEPA vacuum", riskAfter: "low", responsible: "Supervisor", reviewOn: "" },
  { hazard: "Sanding and dust", harm: "Breathing in dust, eye injury", riskBefore: "medium", controls: "Dust mask, safety glasses, dust extraction", riskAfter: "low", responsible: "All painters", reviewOn: "" },
  { hazard: "Spray painting", harm: "Overspray inhaled, injection injury", riskBefore: "high", controls: "Respirator, trained operator only, area masked and cleared", riskAfter: "low", responsible: "Sprayer", reviewOn: "" },
  { hazard: "Water blasting", harm: "Cuts and injection injury, slips", riskBefore: "high", controls: "Trained operator, boots and glasses, area cleared", riskAfter: "medium", responsible: "Operator", reviewOn: "" },
  { hazard: "Elevated work platforms (EWP / scissor lift)", harm: "Falls, tip over, crush", riskBefore: "extreme", controls: "Licensed operator, pre-start check, harness, firm level ground", riskAfter: "medium", responsible: "Operator", reviewOn: "" },
  { hazard: "Slips and trips (drop sheets, leads, wet surfaces)", harm: "Sprains, fractures", riskBefore: "medium", controls: "Tidy site, leads off the ground, secure drop sheets", riskAfter: "low", responsible: "All painters", reviewOn: "" },
  { hazard: "Sun and heat", harm: "Sunburn, heat stress", riskBefore: "medium", controls: "Sunscreen, hat, water, breaks in shade", riskAfter: "low", responsible: "All painters", reviewOn: "" },
  { hazard: "Public and clients near the work", harm: "Injury to others, falling objects", riskBefore: "medium", controls: "Signage, cones / barriers, tools kept off walkways", riskAfter: "low", responsible: "Supervisor", reviewOn: "" },
];

const blank: HazardInput = { hazard: "", harm: "", riskBefore: "", controls: "", riskAfter: "", responsible: "", reviewOn: "" };

export function HazardRegister({ rows, canEdit }: { rows: HazardRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<HazardInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [showOld, setShowOld] = useState(false);
  const shown = rows.filter((r) => r.active || showOld);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-[#5B6472]">The hazards in our work and how we control them. Risk before and after the controls.</p>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            {rows.length === 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => act(async () => {
                  for (const h of STARTERS) {
                    const r = await saveHazardAction(h);
                    if (r.error) return r;
                  }
                  return {};
                })}
                className={secondaryBtn}
              >
                Start with a painter&apos;s usual hazards
              </button>
            )}
            <button type="button" onClick={() => setEditing({ ...blank })} className={primaryBtn}>
              <Plus className="h-4 w-4" /> Add hazard
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}

      {editing && (
        <div className={`${card} grid gap-3 p-4 sm:grid-cols-2`}>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">Hazard</span>
            <input className={input} value={editing.hazard} onChange={(e) => setEditing({ ...editing, hazard: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">Possible harm</span>
            <input className={input} value={editing.harm} onChange={(e) => setEditing({ ...editing, harm: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">Controls</span>
            <textarea className={input} rows={2} value={editing.controls} onChange={(e) => setEditing({ ...editing, controls: e.target.value })} />
          </label>
          {(["riskBefore", "riskAfter"] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">{k === "riskBefore" ? "Risk before controls" : "Risk after controls"}</span>
              <select className={input} value={editing[k]} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })}>
                <option value="">Choose…</option>
                {RISK_LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Who&apos;s responsible</span>
            <input className={input} value={editing.responsible} onChange={(e) => setEditing({ ...editing, responsible: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Review by</span>
            <input type="date" className={input} value={editing.reviewOn} onChange={(e) => setEditing({ ...editing, reviewOn: e.target.value })} />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" disabled={pending} onClick={() => act(() => saveHazardAction(editing), () => setEditing(null))} className={primaryBtn}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className={secondaryBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className={`${card} overflow-x-auto`}>
        {shown.length === 0 ? (
          <p className="p-6 text-sm text-[#5B6472]">No hazards on the register yet.</p>
        ) : (
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead className="border-b border-[#E3E1DA] bg-[#F8F7F3] text-xs uppercase tracking-wide text-[#5B6472]">
              <tr>
                <th className="px-4 py-2">Hazard</th>
                <th className="px-4 py-2">Risk before</th>
                <th className="px-4 py-2">Controls</th>
                <th className="px-4 py-2">Risk after</th>
                <th className="px-4 py-2">Responsible</th>
                {canEdit && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEDE7]">
              {shown.map((h) => (
                <tr key={h.id} className={h.active ? "" : "opacity-50"}>
                  <td className="px-4 py-2.5 align-top">
                    <span className="font-semibold">{h.hazard}</span>
                    {h.harm && <span className="block text-[#5B6472]">{h.harm}</span>}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <RiskPill risk={h.risk_before} />
                  </td>
                  <td className="px-4 py-2.5 align-top whitespace-pre-wrap">{h.controls}</td>
                  <td className="px-4 py-2.5 align-top">
                    <RiskPill risk={h.risk_after} />
                  </td>
                  <td className="px-4 py-2.5 align-top">{h.responsible}</td>
                  {canEdit && (
                    <td className="px-4 py-2.5 align-top whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            id: h.id,
                            hazard: h.hazard,
                            harm: h.harm ?? "",
                            riskBefore: h.risk_before ?? "",
                            controls: h.controls ?? "",
                            riskAfter: h.risk_after ?? "",
                            responsible: h.responsible ?? "",
                            reviewOn: h.review_on ?? "",
                          })
                        }
                        className="font-semibold text-[#1F4E8C] hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => act(() => setHazardActiveAction(h.id, !h.active))}
                        className="ml-3 font-semibold text-[#5B6472] hover:underline"
                      >
                        {h.active ? "Remove" : "Bring back"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {rows.some((r) => !r.active) && (
        <button type="button" onClick={() => setShowOld((v) => !v)} className="self-start text-sm font-semibold text-[#1F4E8C] hover:underline">
          {showOld ? "Hide removed hazards" : "Show removed hazards"}
        </button>
      )}
    </div>
  );
}
