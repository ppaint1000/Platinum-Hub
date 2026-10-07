"use client";

// The job's own pages, down the left (across the top on a phone).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Calculator, FilePlus2, Receipt } from "lucide-react";

export function JobSubNav({ jobId, badges }: { jobId: string; badges: { variations?: number } }) {
  const pathname = usePathname();
  const base = `/jobs/${jobId}`;
  const items = [
    { href: base, label: "Overview", icon: LayoutDashboard },
    { href: `${base}/costs`, label: "Budget & costs", icon: Calculator },
    { href: `${base}/variations`, label: "Variations", icon: FilePlus2, badge: badges.variations },
    { href: `${base}/invoicing`, label: "Invoicing", icon: Receipt },
  ];

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line pb-2 lg:sticky lg:top-4 lg:flex-col lg:overflow-visible lg:border-b-0 lg:pb-0">
      <p className="hidden px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint lg:block">This job</p>
      {items.map(({ href, label, icon: Icon, badge }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
              active ? "bg-ink text-white" : "text-ink-soft hover:bg-black/5 hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {!!badge && (
              <span
                className={`ml-auto rounded-full px-1.5 text-xs font-semibold ${active ? "bg-white text-ink" : "bg-amber-100 text-amber-800"}`}
                title="Waiting for approval"
              >
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
