// A job's health at a glance: a circle for the whole job, hours, and each
// budget category, showing how much of its budget is used. Red = over
// budget, green = within budget, blue = nothing recorded against it yet.
import { Panel } from "@/components/ui";

export type HealthItem = { label: string; actual: number; budget: number; unit?: "$" | "h" };

const RED = "#B91C1C";
const GREEN = "#15803D";
const BLUE = "#1F4E8C";

const fmt = (n: number, unit: "$" | "h" = "$") =>
  unit === "h" ? `${Math.round(n)} h` : "$" + Math.round(n).toLocaleString("en-NZ");

function HealthRing({ item, size = 104 }: { item: HealthItem; size?: number }) {
  const noRecords = item.actual <= 0;
  const noBudget = item.budget <= 0;
  const share = noBudget ? (noRecords ? 0 : 1) : item.actual / item.budget;
  const over = !noRecords && (noBudget || item.actual > item.budget);
  const colour = noRecords ? BLUE : over ? RED : GREEN;
  const stroke = Math.round(size / 9);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(1, share));
  const pctText = noRecords ? "0%" : noBudget ? "No budget" : `${Math.round(share * 100)}%`;
  const status = noRecords ? "Nothing recorded yet" : over ? `Over by ${fmt(item.actual - item.budget, item.unit)}` : `${fmt(item.budget - item.actual, item.unit)} left`;

  return (
    <div className="flex w-32 flex-col items-center gap-1.5 text-center">
      <span className="text-sm font-semibold text-ink">{item.label}</span>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${item.label}: ${pctText}, ${status}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={noRecords ? "#DCE6F3" : "#ECEAE3"} strokeWidth={stroke} />
          {shown > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={colour}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${shown * circumference} ${circumference}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )}
        </svg>
        <span
          aria-hidden
          className={`absolute inset-0 flex items-center justify-center font-bold ${pctText.length > 5 ? "text-xs" : "text-xl"}`}
          style={{ color: colour }}
        >
          {pctText}
        </span>
      </div>
      <span className="text-xs text-ink-soft">
        {fmt(item.actual, item.unit)} of {fmt(item.budget, item.unit)}
      </span>
      <span className="text-xs font-semibold" style={{ color: colour }}>
        {status}
      </span>
    </div>
  );
}

export function JobHealth({ items }: { items: HealthItem[] }) {
  if (items.length === 0) return null;
  return (
    <Panel className="mb-8 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Job dashboard</h2>
        <span className="flex flex-wrap gap-3 text-xs text-ink-soft">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: GREEN }} /> Within budget
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: RED }} /> Over budget
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: BLUE }} /> Nothing recorded yet
          </span>
        </span>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-6 sm:justify-start">
        {items.map((item) => (
          <HealthRing key={item.label} item={item} />
        ))}
      </div>
    </Panel>
  );
}
