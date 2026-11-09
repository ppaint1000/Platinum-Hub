// Health & safety → Ladders: the parts both the server and the Ladders
// screen use - types, the inspection checklist and when each ladder is
// next due. See supabase/safety_ladders.sql.
import { formatNZDay } from "@/lib/timesheets/formatNZ";

// Amber this many days before an inspection is due.
export const LADDER_WARN_DAYS = 7;

export type LadderType = "step" | "extension" | "single" | "platform" | "trestle" | "combination";
export type LadderMaterial = "aluminium" | "fibreglass" | "timber";
export type LadderStatus = "in_service" | "tagged_out" | "retired";
export type CheckResult = "pass" | "fail" | "na";

export const LADDER_TYPES: { value: LadderType; label: string }[] = [
  { value: "step", label: "Stepladder" },
  { value: "extension", label: "Extension" },
  { value: "single", label: "Single" },
  { value: "platform", label: "Platform" },
  { value: "trestle", label: "Trestle" },
  { value: "combination", label: "Combination" },
];
export const MATERIALS: { value: LadderMaterial; label: string }[] = [
  { value: "aluminium", label: "Aluminium" },
  { value: "fibreglass", label: "Fibreglass" },
  { value: "timber", label: "Timber" },
];
export const STATUSES: { value: LadderStatus; label: string }[] = [
  { value: "in_service", label: "In service" },
  { value: "tagged_out", label: "Tagged out" },
  { value: "retired", label: "Retired" },
];

// What's checked at each inspection.
export const CHECKS: { key: string; label: string; hint: string }[] = [
  { key: "stiles", label: "Stiles / rails", hint: "No cracks, splits, bends, dents or corrosion" },
  { key: "rungs", label: "Rungs / steps", hint: "Secure, not bent or worn, free of paint, oil and mud" },
  { key: "feet", label: "Feet / base", hint: "Anti-slip pads present, intact and clean" },
  { key: "locks", label: "Locks, hinges & spreaders", hint: "Spreader bars, hinges and rung locks engage properly" },
  { key: "ropes", label: "Rope & pulley", hint: "Extension ladders - not frayed, runs freely" },
  { key: "labels", label: "Labels & rating", hint: "Load rating (120 kg+) and AS/NZS 1892 label readable" },
];

export type Ladder = {
  id: string;
  asset_no: string;
  ladder_type: LadderType;
  material: LadderMaterial;
  length_m: number | null;
  rating_kg: number | null;
  standard: string | null;
  brand: string | null;
  location: string | null;
  in_service_on: string | null;
  inspect_every_days: number;
  status: LadderStatus;
  notes: string | null;
  created_at: string;
};

export type LadderInspection = {
  id: string;
  ladder_id: string;
  inspected_on: string;
  inspected_by: string | null;
  result: "pass" | "fail";
  checks: Record<string, CheckResult>;
  notes: string | null;
  created_at: string;
};

export type DueState = "ok" | "due" | "overdue" | "never";

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Each ladder's latest inspection (by date, then when it was added).
export function latestInspections(inspections: LadderInspection[]): Map<string, LadderInspection> {
  const best = new Map<string, LadderInspection>();
  for (const i of inspections) {
    const have = best.get(i.ladder_id);
    if (!have || `${i.inspected_on}|${i.created_at}` > `${have.inspected_on}|${have.created_at}`) best.set(i.ladder_id, i);
  }
  return best;
}

export function nextDue(ladder: Ladder, last: LadderInspection | undefined): string | null {
  return last ? addDays(last.inspected_on, ladder.inspect_every_days) : null;
}

export function dueState(ladder: Ladder, last: LadderInspection | undefined, today: string): DueState {
  const due = nextDue(ladder, last);
  if (!due) return "never";
  if (due < today) return "overdue";
  if (due <= addDays(today, LADDER_WARN_DAYS)) return "due";
  return "ok";
}

export const typeLabel = (t: LadderType) => LADDER_TYPES.find((x) => x.value === t)?.label ?? t;
export const materialLabel = (m: LadderMaterial) => MATERIALS.find((x) => x.value === m)?.label ?? m;
export const statusLabel = (s: LadderStatus) => STATUSES.find((x) => x.value === s)?.label ?? s;

// "Extension · Aluminium · 3.6 m · 150 kg".
export function describeLadder(l: Ladder): string {
  return [
    typeLabel(l.ladder_type),
    materialLabel(l.material),
    l.length_m ? `${Number(l.length_m)} m` : null,
    l.rating_kg ? `${l.rating_kg} kg` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// "12 Mar 2027".
export const fmtDay = (day: string) => formatNZDay(day, { day: "numeric", month: "short", year: "numeric" });
