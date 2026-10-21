// Health & safety → Training: the parts both the server and the Training
// screen use - types, expiry colours and each person's current record.
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export const TRAINING_WARN_DAYS = 30;

export type TrainingCourse = { id: string; name: string; valid_months: number | null; sort_order: number; is_active: boolean };

// As on the Staff Training Register: done (with a date, or in house),
// to complete, or not required.
export type Outcome = "done" | "to_complete" | "not_required";
export const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "done", label: "Done" },
  { value: "to_complete", label: "To complete" },
  { value: "not_required", label: "Not required" },
];

export type TrainingRecord = {
  id: string;
  user_id: string;
  course_id: string;
  outcome: Outcome;
  completed_on: string | null;
  expires_on: string | null;
  provider: string | null;
  notes: string | null;
  certificate_path: string | null;
  status: "approved" | "pending";
  created_at: string;
};

export type ExpiryState = "ok" | "due" | "expired";

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function expiryState(expiresOn: string | null, today = nzTodayDateString()): ExpiryState {
  if (!expiresOn) return "ok";
  if (expiresOn < today) return "expired";
  if (expiresOn <= addDays(today, TRAINING_WARN_DAYS)) return "due";
  return "ok";
}

// The expiry a course's length gives (e.g. 24 months after it was done).
export function expiryFor(completedOn: string, validMonths: number | null): string | null {
  if (!completedOn || !validMonths) return null;
  const d = new Date(`${completedOn}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + validMonths);
  return d.toISOString().slice(0, 10);
}

// Each person's current record per course: the latest approved one (by
// the date it was done, else when it was added).
const recency = (r: TrainingRecord) => `${r.completed_on ?? r.created_at.slice(0, 10)}|${r.created_at}`;
export function currentRecords(records: TrainingRecord[]): Map<string, TrainingRecord> {
  const best = new Map<string, TrainingRecord>();
  for (const r of records) {
    if (r.status !== "approved") continue;
    const key = `${r.user_id}:${r.course_id}`;
    const have = best.get(key);
    if (!have || recency(r) > recency(have)) best.set(key, r);
  }
  return best;
}

// "12 Mar 2027".
export const fmtDay = (day: string) =>
  new Date(`${day.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
