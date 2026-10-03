export function fmtCurrency(value: number | null | undefined) {
  if (value == null) return "$0.00";
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
  }).format(value);
}

// Whole dollars, no cents — for tight spots like the totals boxes.
export function fmtCurrencyWhole(value: number | null | undefined) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

export function fmtDate(date: string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function fmtSqm(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value.toFixed(1)} m²`;
}
