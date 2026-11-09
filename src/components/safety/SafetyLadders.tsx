"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Pencil, Plus, Printer } from "lucide-react";
import {
  deleteInspectionAction,
  deleteLadderAction,
  saveInspectionAction,
  saveLadderAction,
  setLadderStatusAction,
  type InspectionInput,
  type LadderInput,
} from "@/app/safety/ladders/actions";
import {
  CHECKS,
  describeLadder,
  dueState,
  fmtDay,
  LADDER_TYPES,
  LADDER_WARN_DAYS,
  latestInspections,
  MATERIALS,
  nextDue,
  STATUSES,
  type CheckResult,
  type DueState,
  type Ladder,
  type LadderInspection,
} from "@/lib/safety/laddersShared";
import { card, input, primaryBtn, secondaryBtn } from "./styles";

type Person = { id: string; full_name: string };

const CHIP = {
  red: "border-[#F5B5B5] bg-[#FDECEC] text-[#B91C1C]",
  amber: "border-[#F2C94C] bg-[#FFF8E1] text-[#8A6100]",
  green: "border-[#B7E1C4] bg-[#EAF7EE] text-[#166534]",
  grey: "border-[#D9D6CC] bg-[#F5F4F0] text-[#7A828F]",
};

// What the "Next due" cell shows, and its colour.
function dueChip(l: Ladder, state: DueState, due: string | null): { text: string; tone: keyof typeof CHIP } {
  if (l.status === "retired") return { text: "Retired", tone: "grey" };
  if (l.status === "tagged_out") return { text: "Tagged out - do not use", tone: "red" };
  if (state === "never") return { text: "Never inspected", tone: "red" };
  if (state === "overdue") return { text: `Overdue - ${fmtDay(due!)}`, tone: "red" };
  if (state === "due") return { text: `Due ${fmtDay(due!)}`, tone: "amber" };
  return { text: fmtDay(due!), tone: "green" };
}

const blankLadder = (today: string): LadderInput => ({
  assetNo: "",
  ladderType: "step",
  material: "aluminium",
  lengthM: "",
  sizeUnit: "m",
  ratingKg: "120",
  standard: "AS/NZS 1892",
  brand: "",
  location: "",
  assignedTo: "",
  inServiceOn: today,
  inspectEveryDays: "30",
  status: "in_service",
  notes: "",
});

const ladderDraft = (l: Ladder): LadderInput => ({
  id: l.id,
  assetNo: l.asset_no,
  ladderType: l.ladder_type,
  material: l.material,
  lengthM: l.steps != null ? String(l.steps) : l.length_m != null ? String(Number(l.length_m)) : "",
  sizeUnit: l.steps != null ? "steps" : "m",
  ratingKg: l.rating_kg != null ? String(l.rating_kg) : "",
  standard: l.standard ?? "",
  brand: l.brand ?? "",
  location: l.location ?? "",
  assignedTo: l.assigned_to ?? "",
  inServiceOn: l.in_service_on ?? "",
  inspectEveryDays: String(l.inspect_every_days),
  status: l.status,
  notes: l.notes ?? "",
});

export function SafetyLadders({
  ladders,
  inspections,
  staff,
  isManager,
  today,
}: {
  ladders: Ladder[];
  inspections: LadderInspection[];
  staff: Person[];
  isManager: boolean;
  today: string;
}) {
  const router = useRouter();
  const [ladderForm, setLadderForm] = useState<LadderInput | null>(null);
  const [inspectionForm, setInspectionForm] = useState<InspectionInput | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [showRetired, setShowRetired] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const latest = useMemo(() => latestInspections(inspections), [inspections]);
  const personName = useMemo(() => new Map(staff.map((p) => [p.id, p.full_name])), [staff]);
  const ladderById = useMemo(() => new Map(ladders.map((l) => [l.id, l])), [ladders]);

  const counts = useMemo(() => {
    let overdue = 0;
    let due = 0;
    let taggedOut = 0;
    for (const l of ladders) {
      if (l.status === "retired") continue;
      if (l.status === "tagged_out") {
        taggedOut++;
        continue;
      }
      const s = dueState(l, latest.get(l.id), today);
      if (s === "overdue" || s === "never") overdue++;
      if (s === "due") due++;
    }
    return { overdue, due, taggedOut, total: ladders.filter((l) => l.status !== "retired").length };
  }, [ladders, latest, today]);

  const q = search.trim().toLowerCase();
  const shown = ladders.filter(
    (l) =>
      (showRetired || l.status !== "retired") &&
      (!q || [l.asset_no, l.location, l.brand, describeLadder(l), l.assigned_to ? personName.get(l.assigned_to) : null].some((v) => v?.toLowerCase().includes(q))),
  );

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
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

  const scrollTo = (id: string) =>
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));

  function openInspection(ladderId: string) {
    setError(null);
    setLadderForm(null);
    setInspectionForm({
      ladderId,
      inspectedOn: today,
      checks: Object.fromEntries(CHECKS.map((c) => [c.key, "pass" as CheckResult])),
      notes: "",
    });
    scrollTo("ladder-inspection-form");
  }

  function editInspection(i: LadderInspection) {
    setError(null);
    setLadderForm(null);
    setInspectionForm({
      id: i.id,
      ladderId: i.ladder_id,
      inspectedOn: i.inspected_on,
      checks: Object.fromEntries(CHECKS.map((c) => [c.key, i.checks?.[c.key] ?? "na"])),
      notes: i.notes ?? "",
    });
    scrollTo("ladder-inspection-form");
  }

  function openLadder(draft: LadderInput) {
    setError(null);
    setInspectionForm(null);
    setLadderForm(draft);
    scrollTo("ladder-form");
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[#5B6472] print:hidden">
        Every ladder with its tag number, where it&apos;s kept and when it&apos;s next due for inspection. Red = overdue, never inspected or tagged out; amber
        = due within {LADDER_WARN_DAYS} days. Check a ladder before use and record it with <strong>Inspect</strong> - any failed check tags it out.
      </p>

      <div className="flex flex-wrap gap-2 text-sm print:hidden">
        <span className={`rounded-full border px-3 py-1 font-semibold ${CHIP.grey}`}>{counts.total} in the register</span>
        {counts.overdue > 0 && <span className={`rounded-full border px-3 py-1 font-semibold ${CHIP.red}`}>{counts.overdue} overdue</span>}
        {counts.taggedOut > 0 && <span className={`rounded-full border px-3 py-1 font-semibold ${CHIP.red}`}>{counts.taggedOut} tagged out</span>}
        {counts.due > 0 && <span className={`rounded-full border px-3 py-1 font-semibold ${CHIP.amber}`}>{counts.due} due soon</span>}
      </div>

      {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {isManager && (
          <button type="button" className={primaryBtn} onClick={() => openLadder(blankLadder(today))}>
            <Plus className="h-4 w-4" /> Add ladder
          </button>
        )}
        <button type="button" className={secondaryBtn} onClick={() => window.print()} disabled={!ladders.length}>
          <Printer className="h-4 w-4" /> Print register
        </button>
        <input className={`${input} ml-auto w-full sm:w-56`} placeholder="Search tag, location..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> Show retired
        </label>
      </div>

      {ladderForm && (
        <LadderForm
          key={ladderForm.id ?? "new"}
          draft={ladderForm}
          staff={staff}
          pending={pending}
          onClose={() => setLadderForm(null)}
          onSave={(d) => run(() => saveLadderAction(d), () => setLadderForm(null))}
          onDelete={
            ladderForm.id
              ? () => {
                  if (!confirm("Delete this ladder and all its inspections? To keep the history, set it to Retired instead.")) return;
                  run(() => deleteLadderAction(ladderForm.id!), () => setLadderForm(null));
                }
              : undefined
          }
        />
      )}

      {inspectionForm && (
        <InspectionForm
          key={inspectionForm.id ?? inspectionForm.ladderId}
          draft={inspectionForm}
          ladder={ladderById.get(inspectionForm.ladderId)}
          pending={pending}
          onClose={() => setInspectionForm(null)}
          onSave={(d) => run(() => saveInspectionAction(d), () => setInspectionForm(null))}
          onDelete={
            inspectionForm.id && isManager
              ? () => {
                  if (!confirm("Delete this inspection?")) return;
                  run(() => deleteInspectionAction(inspectionForm.id!), () => setInspectionForm(null));
                }
              : undefined
          }
        />
      )}

      <div className={`${card} overflow-x-auto`}>
        <h2 className="hidden px-4 pt-4 text-lg font-bold print:block">Ladder register - Platinum Painters NZ Ltd ({fmtDay(today)})</h2>
        {!shown.length ? (
          <p className="p-6 text-sm text-[#5B6472]">
            {ladders.length ? "No ladders match." : isManager ? "No ladders yet - add the first one above." : "No ladders in the register yet."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EFEDE7] text-left text-xs uppercase tracking-wide text-[#5B6472]">
                <th className="px-4 py-2.5">Tag</th>
                <th className="px-3 py-2.5">Ladder</th>
                <th className="px-3 py-2.5">Kept at</th>
                <th className="px-3 py-2.5">Last inspected</th>
                <th className="px-3 py-2.5">Next due</th>
                <th className="px-3 py-2.5 print:hidden" />
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => {
                const last = latest.get(l.id);
                const due = nextDue(l, last);
                const chip = dueChip(l, dueState(l, last, today), due);
                const history = inspections.filter((i) => i.ladder_id === l.id);
                const open = historyFor === l.id;
                return (
                  <Fragment key={l.id}>
                    <tr className={`border-b border-[#EFEDE7] align-top ${l.status === "retired" ? "text-[#7A828F]" : ""}`}>
                      <td className="whitespace-nowrap px-4 py-3 font-bold">{l.asset_no}</td>
                      <td className="px-3 py-3">
                        <div className="font-semibold">{describeLadder(l)}</div>
                        <div className="text-xs text-[#5B6472]">
                          {[l.brand, l.standard, l.in_service_on ? `in service ${fmtDay(l.in_service_on)}` : null, `every ${l.inspect_every_days} days`]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        {l.notes && <div className="mt-0.5 text-xs text-[#5B6472]">{l.notes}</div>}
                      </td>
                      <td className="px-3 py-3">
                        {l.assigned_to || l.location ? (
                          <>
                            {l.assigned_to && <div className="font-semibold">{personName.get(l.assigned_to) ?? "Former staff"}</div>}
                            {l.location && <div className={l.assigned_to ? "text-xs text-[#5B6472]" : ""}>{l.location}</div>}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        {last ? (
                          <>
                            <span className={last.result === "fail" ? "font-semibold text-[#B91C1C]" : ""}>
                              {fmtDay(last.inspected_on)} {last.result === "fail" ? "✗ Failed" : "✓ Pass"}
                            </span>
                            <div className="text-xs text-[#5B6472]">{last.inspected_by ? personName.get(last.inspected_by) ?? "" : ""}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CHIP[chip.tone]}`}>{chip.text}</span>
                      </td>
                      <td className="px-3 py-3 print:hidden">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {l.status !== "retired" && (
                            <button type="button" className={`${primaryBtn} px-3 py-1.5`} onClick={() => openInspection(l.id)}>
                              <ClipboardCheck className="h-4 w-4" /> Inspect
                            </button>
                          )}
                          {isManager && l.status === "tagged_out" && (
                            <button
                              type="button"
                              className={`${secondaryBtn} px-3 py-1.5`}
                              disabled={pending}
                              onClick={() => {
                                if (confirm(`Put ${l.asset_no} back in service? Only do this once it's been repaired and passes an inspection.`))
                                  run(() => setLadderStatusAction(l.id, "in_service"));
                              }}
                            >
                              Back in service
                            </button>
                          )}
                          {isManager && (
                            <button type="button" className={`${secondaryBtn} px-3 py-1.5`} onClick={() => openLadder(ladderDraft(l))}>
                              <Pencil className="h-4 w-4" /> Edit
                            </button>
                          )}
                          {history.length > 0 && (
                            <button type="button" className={`${secondaryBtn} px-3 py-1.5`} onClick={() => setHistoryFor(open ? null : l.id)}>
                              {open ? "Hide" : `History (${history.length})`}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-[#EFEDE7] bg-[#FAF9F6] print:hidden">
                        <td colSpan={6} className="px-4 py-3">
                          <ul className="flex flex-col gap-2">
                            {history.map((i) => {
                              const failed = CHECKS.filter((c) => i.checks?.[c.key] === "fail").map((c) => c.label);
                              return (
                                <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                                  <span className="w-28 font-semibold">{fmtDay(i.inspected_on)}</span>
                                  <span className={`font-semibold ${i.result === "fail" ? "text-[#B91C1C]" : "text-[#166534]"}`}>
                                    {i.result === "fail" ? "✗ Failed" : "✓ Pass"}
                                  </span>
                                  <span className="text-[#5B6472]">{i.inspected_by ? personName.get(i.inspected_by) ?? "" : ""}</span>
                                  {failed.length > 0 && <span className="text-[#B91C1C]">{failed.join(", ")}</span>}
                                  {i.notes && <span className="text-[#5B6472]">- {i.notes}</span>}
                                  {isManager && (
                                    <button type="button" className="ml-auto text-xs font-semibold text-[#1F4E8C] underline" onClick={() => editInspection(i)}>
                                      Edit
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${wide ? "sm:col-span-2" : ""}`}>
      <span className="font-semibold">{label}</span>
      {children}
    </label>
  );
}

function LadderForm({
  draft,
  staff,
  pending,
  onClose,
  onSave,
  onDelete,
}: {
  draft: LadderInput;
  staff: Person[];
  pending: boolean;
  onClose: () => void;
  onSave: (d: LadderInput) => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState(draft);
  // Someone who's since left stays selectable on a ladder still with them.
  const people = d.assignedTo && !staff.some((p) => p.id === d.assignedTo) ? [...staff, { id: d.assignedTo, full_name: "Former staff" }] : staff;
  const set = <K extends keyof LadderInput>(k: K, v: LadderInput[K]) => setD((x) => ({ ...x, [k]: v }));
  return (
    <form
      id="ladder-form"
      className={`${card} flex flex-col gap-4 p-4 print:hidden`}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(d);
      }}
    >
      <h2 className="text-base font-bold">{d.id ? `Edit ladder ${draft.assetNo}` : "Add a ladder"}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Tag number">
          <input className={input} value={d.assetNo} onChange={(e) => set("assetNo", e.target.value)} placeholder="e.g. L01" required />
        </Field>
        <Field label="Type">
          <select className={input} value={d.ladderType} onChange={(e) => set("ladderType", e.target.value as LadderInput["ladderType"])}>
            {LADDER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Material">
          <select className={input} value={d.material} onChange={(e) => set("material", e.target.value as LadderInput["material"])}>
            {MATERIALS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Size">
          <div className="flex gap-2">
            <input
              className={input}
              inputMode={d.sizeUnit === "steps" ? "numeric" : "decimal"}
              value={d.lengthM}
              onChange={(e) => set("lengthM", e.target.value)}
              placeholder={d.sizeUnit === "steps" ? "e.g. 6" : "e.g. 3.6"}
              aria-label={d.sizeUnit === "steps" ? "Number of steps" : "Length in metres"}
            />
            <select className={`${input} w-auto`} value={d.sizeUnit} onChange={(e) => set("sizeUnit", e.target.value as LadderInput["sizeUnit"])} aria-label="Size in">
              <option value="m">metres</option>
              <option value="steps">steps</option>
            </select>
          </div>
        </Field>
        <Field label="Load rating (kg)">
          <input className={input} inputMode="numeric" value={d.ratingKg} onChange={(e) => set("ratingKg", e.target.value)} />
        </Field>
        <Field label="Standard">
          <input className={input} value={d.standard} onChange={(e) => set("standard", e.target.value)} />
        </Field>
        <Field label="Brand / model">
          <input className={input} value={d.brand} onChange={(e) => set("brand", e.target.value)} />
        </Field>
        <Field label="Kept at" wide>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select className={input} value={d.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} aria-label="Person it's kept with">
              <option value="">No one - yard / store</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <input className={input} value={d.location} onChange={(e) => set("location", e.target.value)} placeholder="Where - e.g. Dyna 1, yard, site" aria-label="Where it's kept" />
          </div>
          <span className="text-xs font-normal text-[#5B6472]">The person picked gets the inspection reminders, along with the supervisors.</span>
        </Field>
        <Field label="In service since">
          <input type="date" className={input} value={d.inServiceOn} onChange={(e) => set("inServiceOn", e.target.value)} />
        </Field>
        <Field label="Inspect every (days)">
          <input className={input} inputMode="numeric" value={d.inspectEveryDays} onChange={(e) => set("inspectEveryDays", e.target.value)} />
        </Field>
        <Field label="Status">
          <select className={input} value={d.status} onChange={(e) => set("status", e.target.value as LadderInput["status"])}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" wide>
          <input className={input} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
      {Number(d.ratingKg) > 0 && Number(d.ratingKg) < 120 && (
        <p className="text-sm font-semibold text-[#8A6100]">Under 120 kg isn&apos;t an industrial rating - it shouldn&apos;t be used on site.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryBtn} disabled={pending}>
          {pending ? "Saving..." : "Save ladder"}
        </button>
        <button type="button" className={secondaryBtn} onClick={onClose}>
          Cancel
        </button>
        {onDelete && (
          <button type="button" className={`${secondaryBtn} ml-auto text-[#B91C1C]`} onClick={onDelete} disabled={pending}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

const RESULT_BTN: Record<CheckResult, { label: string; on: string }> = {
  pass: { label: "Pass", on: "border-[#166534] bg-[#EAF7EE] text-[#166534]" },
  fail: { label: "Fail", on: "border-[#B91C1C] bg-[#FDECEC] text-[#B91C1C]" },
  na: { label: "N/A", on: "border-[#7A828F] bg-[#F5F4F0] text-[#5B6472]" },
};

function InspectionForm({
  draft,
  ladder,
  pending,
  onClose,
  onSave,
  onDelete,
}: {
  draft: InspectionInput;
  ladder: Ladder | undefined;
  pending: boolean;
  onClose: () => void;
  onSave: (d: InspectionInput) => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState(draft);
  const failing = Object.values(d.checks).includes("fail");
  return (
    <form
      id="ladder-inspection-form"
      className={`${card} flex flex-col gap-4 p-4 print:hidden ${failing ? "border-[#F5B5B5]" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(d);
      }}
    >
      <div>
        <h2 className="text-base font-bold">
          {d.id ? "Edit inspection" : "Inspect"} {ladder ? `${ladder.asset_no} - ${describeLadder(ladder)}` : ""}
        </h2>
        {ladder?.status === "tagged_out" && <p className="text-sm text-[#5B6472]">This ladder is tagged out. A manager puts it back in service once it passes.</p>}
      </div>
      <Field label="Date checked">
        <input type="date" className={`${input} sm:w-48`} value={d.inspectedOn} onChange={(e) => setD({ ...d, inspectedOn: e.target.value })} required />
      </Field>
      <ul className="flex flex-col divide-y divide-[#EFEDE7] rounded-lg border border-[#E3E1DA]">
        {CHECKS.map((c) => (
          <li key={c.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{c.label}</div>
              <div className="text-xs text-[#5B6472]">{c.hint}</div>
            </div>
            <div className="flex gap-1.5" role="radiogroup" aria-label={c.label}>
              {(Object.keys(RESULT_BTN) as CheckResult[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={d.checks[c.key] === v}
                  onClick={() => setD({ ...d, checks: { ...d.checks, [c.key]: v } })}
                  className={`min-w-14 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    d.checks[c.key] === v ? RESULT_BTN[v].on : "border-[#D9D6CC] bg-white text-[#9AA1AC]"
                  }`}
                >
                  {RESULT_BTN[v].label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <Field label={failing ? "What's wrong with it? (required)" : "Notes"}>
        <textarea className={input} rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} required={failing} />
      </Field>
      {failing && !d.id && (
        <p className="text-sm font-semibold text-[#B91C1C]">Failed - saving this tags the ladder out. Put a &quot;Do not use&quot; tag on it now.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryBtn} disabled={pending}>
          {pending ? "Saving..." : failing ? "Save - failed" : "Save - passed"}
        </button>
        <button type="button" className={secondaryBtn} onClick={onClose}>
          Cancel
        </button>
        {onDelete && (
          <button type="button" className={`${secondaryBtn} ml-auto text-[#B91C1C]`} onClick={onDelete} disabled={pending}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
