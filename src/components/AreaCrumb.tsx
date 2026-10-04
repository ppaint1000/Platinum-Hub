"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SETTINGS_GROUPS } from "@/lib/settingsMenu";
import { OTHER_REPORT_GROUPS, REPORT_GROUPS } from "@/lib/reports/build";

// A thin "‹ Settings › Pricing and costing › Rates" bar on every page that's
// part of Settings or Reports, so you can always get back to the area -
// whichever app the page lives in.
type Entry = { href: string; area: "Settings" | "Reports"; areaHref: string; group: string; label: string };

const ENTRIES: Entry[] = [
  ...SETTINGS_GROUPS.flatMap((g) =>
    g.items.map((i) => ({ href: i.href, area: "Settings" as const, areaHref: "/settings", group: g.title, label: i.label }))
  ),
  ...REPORT_GROUPS.flatMap((g) =>
    g.reports.map((r) => ({ href: `/reports/${r.slug}`, area: "Reports" as const, areaHref: "/reports", group: g.title, label: r.title }))
  ),
  ...OTHER_REPORT_GROUPS.flatMap((g) =>
    g.reports.map((r) => ({ href: r.href, area: "Reports" as const, areaHref: "/reports", group: g.title, label: r.title }))
  ),
];

// The most specific page that matches (so /timesheets/admin/reports/by-job
// isn't taken for /timesheets/admin/reports).
function entryFor(pathname: string) {
  let best: Entry | null = null;
  for (const e of ENTRIES) {
    if (pathname === e.href || pathname.startsWith(e.href + "/")) {
      if (!best || e.href.length > best.href.length) best = e;
    }
  }
  return best;
}

export function AreaCrumb() {
  const pathname = usePathname();
  const entry = entryFor(pathname);
  if (!entry) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap border-b border-[#E3E1DA] bg-[#F5F4F0] px-4 py-1.5 text-[13px] text-[#5B6472] print:hidden md:px-8"
    >
      <Link href={entry.areaHref} className="flex items-center gap-0.5 font-semibold text-[#1F4E8C] hover:underline">
        <ChevronLeft className="h-4 w-4" aria-hidden />
        {entry.area}
      </Link>
      <span aria-hidden>›</span>
      <Link href={`${entry.areaHref}#${entry.group.toLowerCase().replace(/[^a-z]+/g, "-")}`} className="hover:underline">
        {entry.group}
      </Link>
      <span aria-hidden>›</span>
      <span className="font-medium text-[#16202E]">{entry.label}</span>
    </nav>
  );
}
