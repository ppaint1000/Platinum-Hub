import Link from "next/link";
import type { SalesPerson } from "@/lib/sales/dashboard";

// Tabs across the Sales pages for admins and sales authority: the whole
// team, their own figures (if they're in the sales team), each other
// salesperson, and the budget tables.
export function SalesTabs({
  team,
  viewerId,
  inSalesTeam,
  canEditBudgets,
  activeHref,
}: {
  team: SalesPerson[];
  viewerId: string;
  inSalesTeam: boolean;
  canEditBudgets: boolean;
  activeHref: string;
}) {
  const tabs = [
    { href: "/sales", label: "Overall" },
    ...(inSalesTeam ? [{ href: "/sales/dashboard", label: "My sales" }] : []),
    ...team.filter((p) => p.id !== viewerId).map((p) => ({ href: `/sales/dashboard/${p.id}`, label: p.name })),
    { href: "/sales/budgets", label: canEditBudgets ? "Budgets" : "Budget tables" },
  ];

  return (
    <nav aria-label="Sales" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex w-max gap-2">
        {tabs.map((tab) => {
          const active = tab.href === activeHref;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition ${
                  active
                    ? "border-[#16202E] bg-[#16202E] text-white"
                    : "border-[#D9D6CC] bg-white text-[#3F4753] hover:border-[#1F4E8C] hover:text-[#1F4E8C]"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
