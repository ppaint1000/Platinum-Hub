import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Briefcase,
  Calculator,
  ChevronDown,
  Clock,
  Contact,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  Ruler,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import { MEASURES_URL } from "@/lib/measuresUrl";
import { NAVY } from "./parts";

export type NavItem = { href: string; label: string; icon: LucideIcon; external?: boolean };

// Admins get every app. Costing and Measures live in the separate Measures
// app, so they open in a new tab, the same as their Hub tiles.
export const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/timesheets/admin", label: "Timesheets", icon: Clock },
  { href: "/clients", label: "Clients", icon: Contact },
  { href: "/sales", label: "Sales", icon: TrendingUp },
  { href: `${MEASURES_URL}/costing`, label: "Costing", icon: Calculator, external: true },
  { href: `${MEASURES_URL}/site-measures`, label: "Measures", icon: Ruler, external: true },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/fleet", label: "Fleet", icon: Truck },
  { href: "/users", label: "Users", icon: UserCog },
  { href: "/hub", label: "All apps", icon: LayoutGrid },
];

// Everyone else only sees the apps ticked for them on the Users page - the
// same rules as their Hub tiles (Jobs access also covers Clients).
export function staffNav(access: {
  timesheets?: boolean;
  jobs?: boolean;
  orders?: boolean;
  fleet?: boolean;
  salesAuthority?: boolean;
}): NavItem[] {
  const items: NavItem[] = [{ href: "/sales/dashboard", label: "My sales", icon: LayoutDashboard }];
  if (access.salesAuthority) items.push({ href: "/sales", label: "Team sales", icon: TrendingUp });
  if (access.jobs) {
    items.push({ href: "/jobs", label: "Jobs", icon: Briefcase });
    items.push({ href: "/clients", label: "Clients", icon: Contact });
  }
  if (access.timesheets) items.push({ href: "/timesheets", label: "Timesheets", icon: Clock });
  if (access.orders) items.push({ href: "/orders", label: "Orders", icon: ShoppingCart });
  if (access.fleet) items.push({ href: "/fleet", label: "Fleet", icon: Truck });
  items.push({ href: "/hub", label: "All apps", icon: LayoutGrid });
  return items;
}

const tabClass =
  "flex items-center border-b-[3px] px-3 pt-[3px] text-sm font-medium whitespace-nowrap transition";
const tabIdle = "border-transparent text-[#C9D1DC] hover:bg-white/10 hover:text-white";

// Desktop: one row of links across the top bar, Xero style. Costing and
// Measures (the separate Measures app) sit together in a drop-down tab,
// listed the same way as the phone menu.
function NavRow({ items, activeHref }: { items: NavItem[]; activeHref: string }) {
  const inRow = items.filter((item) => !item.external);
  const measures = items.filter((item) => item.external);
  const dropdownAfter = items.findIndex((item) => item.external) - 1;

  return (
    <ul className="flex h-full items-stretch">
      {inRow.map((item) => {
        const active = item.href === activeHref;
        return (
          <Fragment key={item.href}>
            <li className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`${tabClass} ${active ? "border-white text-white" : tabIdle}`}
              >
                {item.label}
              </Link>
            </li>
            {dropdownAfter >= 0 && item === items[dropdownAfter] && <MeasuresDropdown items={measures} />}
          </Fragment>
        );
      })}
    </ul>
  );
}

function MeasuresDropdown({ items }: { items: NavItem[] }) {
  return (
    <li className="relative flex">
      <details className="group flex">
        <summary className={`${tabClass} ${tabIdle} cursor-pointer list-none gap-1 group-open:bg-white/10 group-open:text-white [&::-webkit-details-marker]:hidden`}>
          Costing &amp; Measures
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden />
        </summary>
        <ul
          className="absolute left-0 top-full z-30 flex min-w-52 flex-col gap-0.5 rounded-b-lg p-2 shadow-lg"
          style={{ background: NAVY }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#C9D1DC] transition hover:bg-white/10 hover:text-white"
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

// Phone and tablet: the same links in a drop-down list.
function NavList({ items, activeHref }: { items: NavItem[]; activeHref: string }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.href === activeHref;
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                active ? "bg-white/15 font-semibold text-white" : "text-[#C9D1DC] hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Logo({ href, className }: { href: string; className: string }) {
  return (
    <Link href={href} className="block">
      <Image
        src="/platinum-painters-logo.png"
        alt="Platinum Painters"
        width={1983}
        height={793}
        priority
        className={`h-auto ${className}`}
      />
    </Link>
  );
}

// The row of tabs only shows once there's room for it; below that, the menu
// button. A short menu (most sales staff) fits from tablet width, the full
// admin menu needs a wide screen. Written out in full so Tailwind sees them.
const BREAKPOINTS = {
  md: { row: "hidden px-8 md:block", menu: "group px-4 py-2.5 md:hidden" },
  lg: { row: "hidden px-8 lg:block", menu: "group px-4 py-2.5 lg:hidden" },
  xl: { row: "hidden px-8 xl:block", menu: "group px-4 py-2.5 xl:hidden" },
};

function breakpointFor(items: NavItem[]) {
  const tabs = items.filter((item) => !item.external).length + (items.some((item) => item.external) ? 1 : 0);
  if (tabs <= 5) return BREAKPOINTS.md;
  if (tabs <= 8) return BREAKPOINTS.lg;
  return BREAKPOINTS.xl;
}

export function TopBar({ items, activeHref }: { items: NavItem[]; activeHref: string }) {
  // The logo goes to the first item - the Dashboard for admins, their own
  // sales dashboard for sales staff.
  const home = items[0].href;
  const breakpoint = breakpointFor(items);
  return (
    <header className="sticky top-0 z-20 text-white shadow-sm" style={{ background: NAVY }}>
      {/* Wide enough for the row of tabs */}
      <div className={breakpoint.row}>
        <div className="mx-auto flex h-16 max-w-6xl items-stretch gap-6">
          <div className="flex items-center">
            <Logo href={home} className="w-28" />
          </div>
          <nav aria-label="Main" className="flex-1">
            <NavRow items={items} activeHref={activeHref} />
          </nav>
          <div className="flex items-center">
            <SignOutButton className="min-h-10 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-[#C9D1DC] hover:bg-white/10 hover:text-white" />
          </div>
        </div>
      </div>

      {/* Narrower: menu button */}
      <details className={breakpoint.menu}>
        <summary className="flex list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <Logo href={home} className="w-24" />
          <span className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-[#2A3748] group-open:bg-white/10">
            <Menu className="h-5 w-5" aria-hidden />
            <span className="sr-only">Menu</span>
          </span>
        </summary>
        <nav aria-label="Main" className="mt-3 border-t border-[#2A3748] pb-2 pt-3">
          <NavList items={items} activeHref={activeHref} />
          <SignOutButton className="mt-1 min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-[#C9D1DC] hover:bg-white/10 hover:text-white" />
        </nav>
      </details>
    </header>
  );
}
