// Pieces shared by the admin Dashboard and the sales dashboards, so they
// look and read the same.
import Link from "next/link";
import type { Level } from "@/lib/dashboard/data";

// Colours from the Dashboard brief. Warnings are always solid red with white
// text; "due soon" is light blue.
export const NAVY = "#16202E";
export const BLUE = "#1F4E8C";
export const RED = "#B91C1C";
export const QUOTED_FILL = "#9DB6D9";

export const display = "[font-family:var(--font-display)]";

// ── Formatting ─────────────────────────────────────────────────────────

export const money = (n: number) =>
  (n < 0 ? "−$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-NZ");
export const moneyK = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : money(n));
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function fmtDate(key: string | null) {
  if (!key) return "—";
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function todayLabel(todayKey: string) {
  return new Date(`${todayKey}T00:00:00Z`).toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Small pieces ───────────────────────────────────────────────────────

const PILL: Record<Level, string> = {
  alert: "bg-[#B91C1C] text-white",
  soon: "bg-[#E3ECF8] text-[#163A69]",
  ok: "bg-[#ECEAE3] text-[#3F4753]",
};

export function Pill({ level, children }: { level: Level; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${PILL[level]}`}
    >
      {children}
    </span>
  );
}

export function Bar({ value, max, alert, label }: { value: number; max: number; alert: boolean; label: string }) {
  const width = max > 0 ? Math.min(value / max, 1) * 100 : 0;
  return (
    <div
      role="img"
      aria-label={label}
      className="h-2.5 w-full overflow-hidden rounded-full bg-[#ECEAE3]"
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${width}%`, background: alert ? RED : BLUE }}
      />
    </div>
  );
}

export function SectionHeading({
  title,
  count,
  href,
  linkLabel,
}: {
  title: string;
  count?: number;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className={`${display} text-lg font-bold md:text-xl`}>{title}</h2>
        {count ? (
          <span className="rounded-full bg-[#B91C1C] px-2 py-0.5 text-xs font-semibold text-white">
            {count}
          </span>
        ) : null}
      </div>
      {href && (
        <Link
          href={href}
          className="py-2.5 text-sm font-semibold text-[#1F4E8C] hover:text-[#163A69] hover:underline"
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[#E3E1DA] bg-white ${className}`}>{children}</div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-sm text-[#5B6472]">{children}</p>;
}

export function Headline({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-1 p-3.5 md:p-5">
      <span className="text-xs font-semibold text-[#5B6472] md:text-sm">{label}</span>
      <span className={`${display} text-2xl font-bold md:text-[32px] md:leading-tight`}>{value}</span>
      <div className="text-xs text-[#5B6472] md:text-sm">{children}</div>
    </Card>
  );
}

// Page frame: top bar, date and title, then the page's sections.
export function DashboardShell({
  fontClass,
  topBar,
  todayKey,
  title,
  children,
}: {
  fontClass: string;
  topBar: React.ReactNode;
  todayKey: string;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${fontClass} flex min-h-screen flex-col bg-[#F5F4F0] text-[#16202E] [font-family:var(--font-body)] [font-variant-numeric:tabular-nums]`}
    >
      {topBar}

      <main className="min-w-0 flex-1 px-4 pb-10 pt-5 md:px-8 md:pt-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 md:gap-8">
          <div>
            <p className="text-[13px] text-[#5B6472] md:text-sm">{todayLabel(todayKey)}</p>
            <h1 className={`${display} text-[28px] font-bold leading-tight md:text-3xl`}>{title}</h1>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
