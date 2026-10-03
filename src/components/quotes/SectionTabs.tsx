"use client";

import Link from "next/link";
import { useMcAccess } from "@/components/quotes/McAccess";

const tabClass =
  "flex-none whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-sm font-semibold transition";

// Jump between the two halves of the app (Costing and Site Measures) from
// pages that don't have Costing's own tab bar. `active` is the section
// you're on, or null for neither (e.g. Customers).
export function SectionTabs({ active }: { active: "costing" | "site-measures" | null }) {
  const access = useMcAccess();
  const items = (
    [
      { key: "costing", href: "/costing", label: "Costing" },
      { key: "site-measures", href: "/site-measures", label: "Site Measures" },
    ] as const
  ).filter((item) => (item.key === "costing" ? access.costing : access.measures));

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {items.map((item) =>
        item.key === active ? (
          <span key={item.key} className={`${tabClass} border-ink bg-ink text-white`}>
            {item.label}
          </span>
        ) : (
          <Link
            key={item.key}
            href={item.href}
            className={`${tabClass} border-border bg-surface text-ink hover:bg-background`}
          >
            {item.label}
          </Link>
        )
      )}
    </div>
  );
}
