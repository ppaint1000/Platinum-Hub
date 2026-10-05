"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/safety", label: "Overview" },
  { href: "/safety/reports", label: "Reports" },
  { href: "/safety/incidents", label: "Incidents" },
  { href: "/safety/hazards", label: "Hazard register" },
  { href: "/safety/tasks", label: "Tasks" },
  { href: "/safety/templates", label: "Templates" },
  { href: "/safety/documents", label: "Documents" },
  { href: "/safety/contractors", label: "Contractors", managers: true },
];

export function SafetyNav({ isManager }: { isManager: boolean }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/safety" ? pathname === href : pathname.startsWith(href));
  return (
    <nav aria-label="Health and safety" className="flex gap-2 overflow-x-auto pb-1 print:hidden">
      {TABS.filter((t) => !t.managers || isManager).map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active(t.href) ? "page" : undefined}
          className={`flex-none whitespace-nowrap rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${
            active(t.href) ? "border-[#16202E] bg-[#16202E] text-white" : "border-[#E3E1DA] bg-white text-[#16202E] hover:bg-[#F8FAFD]"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
