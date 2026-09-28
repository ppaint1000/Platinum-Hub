export const ABSENCE_TYPES = [
  { value: "sick", label: "Off sick" },
  { value: "authorised_leave", label: "Authorised leave" },
  { value: "unauthorised_leave", label: "Unauthorised leave" },
  { value: "not_rostered", label: "Not rostered / public holiday" },
] as const;

export type AbsenceType = (typeof ABSENCE_TYPES)[number]["value"];

export const ABSENCE_LABEL: Record<AbsenceType, string> = Object.fromEntries(
  ABSENCE_TYPES.map((t) => [t.value, t.label])
) as Record<AbsenceType, string>;

export function isAbsenceType(value: unknown): value is AbsenceType {
  return ABSENCE_TYPES.some((t) => t.value === value);
}

// "Not rostered / public holiday" clears a false alarm - it's kept on record
// but never counted as an absence in the stats.
export const COUNTED_TYPES: AbsenceType[] = ["sick", "authorised_leave", "unauthorised_leave"];

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] as const;

// Monday = 0 ... Friday = 4 for a YYYY-MM-DD date (null at weekends).
export function weekdayIndex(dateKey: string): number | null {
  const dow = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  return dow >= 1 && dow <= 5 ? dow - 1 : null;
}
