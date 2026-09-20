// Profit/margin for a job, shared by the Jobs list and the job page.
//
// Once costs have been recorded against a job, profit is quoted minus what
// it has actually cost. Before that (a job just quoted, or won but not yet
// started) actual cost is $0, which would read as a 100% margin - so fall
// back to the quote's own budget for an expected margin instead, and flag it
// as an estimate. With neither actuals nor a budget there's nothing to base
// a figure on, so return nulls rather than a made-up 100%.
export function jobMargin({
  quoted,
  budgeted,
  actual,
}: {
  quoted: number;
  budgeted: number;
  actual: number;
}): { profit: number | null; margin: number | null; estimated: boolean } {
  if (quoted <= 0) return { profit: null, margin: null, estimated: false };

  if (actual > 0) {
    const profit = quoted - actual;
    return { profit, margin: profit / quoted, estimated: false };
  }
  if (budgeted > 0) {
    const profit = quoted - budgeted;
    return { profit, margin: profit / quoted, estimated: true };
  }
  return { profit: null, margin: null, estimated: false };
}
