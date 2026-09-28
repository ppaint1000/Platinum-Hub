// Sales year runs Apr-Mar (NZ tax year), not Jan-Dec. "Start year" is the
// calendar year April falls in - e.g. start year 2026 covers Apr 2026
// through Mar 2027. sales_targets/jobs are still keyed by plain calendar
// year+month, so this just windows 12 specific (year, month) pairs over
// that storage rather than changing it.
export function fiscalYearStart(today = new Date()): number {
  return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
}

export function fiscalMonths(startYear: number): { year: number; month: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = ((3 + i) % 12) + 1; // i=0 -> 4 (Apr) ... i=11 -> 3 (Mar)
    const year = month >= 4 ? startYear : startYear + 1;
    return { year, month };
  });
}

export function fiscalYearLabel(startYear: number): string {
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}
