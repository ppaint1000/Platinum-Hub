// Base components for the Jobs module, built on the tokens in
// src/design/tailwind.tokens.ts. Status is always shown as a coloured left
// border, never a separate badge chip — keeps the eye on the numbers.

import { jobStatusColor, jobStatusLabel } from "@/design/tailwind.tokens";

// --- Panel: the one container type. No card shadows, no varying radius
// for the same kind of content — a hairline border does the separating.
export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-paper-raised border border-line rounded-md ${className}`}>
      {children}
    </div>
  );
}

// --- StatusRow: a row (job, order, invoice) with its status carried as a
// left border colour + small label, not a pill badge.
export function StatusRow({
  status,
  children,
  onClick,
}: {
  status: keyof typeof jobStatusColor;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const color = jobStatusColor[status] ?? "#8A938E";
  return (
    <div
      onClick={onClick}
      style={{ borderLeftColor: color }}
      className={`border-l-4 bg-paper-raised border-t border-r border-b border-line
      pl-4 pr-4 py-3 flex items-center justify-between
      ${onClick ? "cursor-pointer hover:bg-accent-soft/40" : ""}`}
    >
      {children}
    </div>
  );
}

export function StatusLabel({ status }: { status: keyof typeof jobStatusColor }) {
  const color = jobStatusColor[status] ?? "#8A938E";
  return (
    <span className="text-sm font-medium" style={{ color }}>
      {jobStatusLabel[status] ?? status}
    </span>
  );
}

// --- Money: right-aligned, tabular figures, so budget vs actual columns
// line up. Negative variance (over budget) renders in brick, not just red-500.
export function Money({
  value,
  variant = "default",
}: {
  value: number;
  variant?: "default" | "variance";
}) {
  const isOver = variant === "variance" && value > 0;
  const formatted = new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(Math.abs(value));

  return (
    <span className="tabular-nums" style={{ color: isOver ? "#B33F3F" : undefined }}>
      {variant === "variance" ? (value >= 0 ? "+" : "−") + formatted : formatted}
    </span>
  );
}

// --- SummaryStat: the top-of-page number strip. One clear number, one
// quiet label below it — no icon, no card shadow, no trend arrow unless
// there's a real trend to show.
export function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-line last:border-r-0 pr-6 mr-6">
      <div className="text-2xl font-bold text-ink tabular-nums">{value}</div>
      <div className="text-sm text-ink-soft mt-1">{label}</div>
    </div>
  );
}

// --- LedgerTable: spreadsheet-style rules instead of a boxed "card table".
export function LedgerTable({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-left text-ink-soft">
          {headers.map((h, i) => (
            <th key={h} className={`py-2 font-medium ${i > 0 ? "text-right pl-4" : ""}`}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">{children}</tbody>
    </table>
  );
}

// --- Button: one primary style using the accent colour, one quiet
// secondary style. No arrow glyphs appended — the label states the action.
export function Button({
  children,
  variant = "primary",
  onClick,
  type = "button",
  disabled = false,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const base = "px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
  const styles =
    variant === "primary"
      ? "bg-accent text-white hover:bg-accent-hover"
      : "bg-transparent text-ink border border-line hover:bg-paper-sunken";
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}
