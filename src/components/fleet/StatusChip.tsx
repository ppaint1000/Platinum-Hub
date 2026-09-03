import { daysUntil, expiryStatus } from "@/lib/fleet/format";

const STYLES: Record<string, string> = {
  ok: "bg-green-50 text-green-700",
  warn: "bg-amber-50 text-amber-700",
  critical: "bg-red-50 text-brand-red",
  none: "bg-border/50 text-muted",
};

export function ExpiryChip({ date }: { date: string | null | undefined }) {
  const status = expiryStatus(date);
  const days = daysUntil(date);

  let label = "Not set";
  if (status === "critical") label = `Overdue ${Math.abs(days!)}d`;
  else if (status === "warn") label = `Due in ${days}d`;
  else if (status === "ok") label = `OK · ${days}d`;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STYLES[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
