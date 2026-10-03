const LABELS: Record<string, string> = {
  draft_review: "Draft to be checked",
};

const STYLES: Record<string, string> = {
  draft: "bg-border/50 text-muted",
  draft_review: "bg-amber-50 text-amber-700",
  sent: "bg-blue-50 text-blue-700",
  accepted: "bg-green-50 text-green-700",
  complete: "bg-purple-50 text-purple-700",
  declined: "bg-red-50 text-brand-red",
  expired: "bg-amber-50 text-amber-700",
};

export function QuoteStatusChip({ status }: { status: string }) {
  const style = STYLES[status] ?? STYLES.draft;
  const label = LABELS[status] ?? status[0].toUpperCase() + status.slice(1);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
