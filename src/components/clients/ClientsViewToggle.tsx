import Link from "next/link";
import type { Period } from "@/lib/clients/winRate";

// Switch between the win-rate report (table) and the clients dashboard,
// keeping the same month/quarter/year.
export function ClientsViewToggle({ active, period }: { active: "report" | "dashboard"; period: Period }) {
  const views = [
    { key: "report", label: "Report", href: `/clients/report?period=${period}` },
    { key: "dashboard", label: "Dashboard", href: `/clients/dashboard?period=${period}` },
  ] as const;

  return (
    <div role="group" aria-label="View" className="inline-flex rounded-lg border border-[#D9D6CC] bg-white p-0.5">
      {views.map((v) => (
        <Link
          key={v.key}
          href={v.href}
          aria-current={v.key === active ? "page" : undefined}
          className={`flex min-h-9 items-center rounded-md px-3.5 text-sm font-semibold transition ${
            v.key === active ? "bg-[#16202E] text-white" : "text-[#3F4753] hover:text-[#1F4E8C]"
          }`}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}

export function PeriodPills({ period, basePath }: { period: Period; basePath: string }) {
  return (
    <div className="inline-flex gap-1">
      {(["month", "quarter", "year"] as Period[]).map((p) => (
        <Link
          key={p}
          href={`${basePath}?period=${p}`}
          aria-current={p === period ? "page" : undefined}
          className={`flex min-h-9 items-center rounded-md px-3 text-sm font-semibold capitalize transition ${
            p === period ? "bg-[#1F4E8C] text-white" : "text-[#3F4753] hover:bg-[#ECEAE3]"
          }`}
        >
          {p}
        </Link>
      ))}
    </div>
  );
}
