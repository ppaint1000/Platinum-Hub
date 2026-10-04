import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  Settings,
  Briefcase,
  Calculator,
  CalendarX,
  ChevronDown,
  Clock,
  Kanban,
  PieChart,
  Receipt,
  Contact,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  Ruler,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserCircle,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import { pendingAbsenceCount } from "@/lib/absences/check";
import { hoursAlertCounts } from "@/lib/jobs/hoursApproval";
import { readyToInvoiceCount, runAutoOnHold } from "@/lib/jobs/production";
import { NAVY } from "./parts";

// group: shown together in the desktop "Costing & Measures" drop-down.
export type NavItem = { href: string; label: string; icon: LucideIcon; external?: boolean; group?: boolean };

// Admins get every app. Costing and Measures live in the separate Measures
// app, so they open in a new tab, the same as their Hub tiles.
export const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/production", label: "Production", icon: Kanban },
  { href: "/jobs/invoices", label: "Invoices", icon: Receipt },
  { href: "/timesheets/admin", label: "Timesheets", icon: Clock },
  { href: "/absences", label: "Absences", icon: CalendarX },
  { href: "/clients", label: "Clients", icon: Contact },
  { href: "/sales", label: "Sales", icon: TrendingUp },
  { href: "/reports", label: "Reports", icon: PieChart },
  { href: "/costing", label: "Costing", icon: Calculator, group: true },
  { href: "/site-measures", label: "Measures", icon: Ruler, group: true },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/fleet", label: "Fleet", icon: Truck },
  { href: "/users", label: "Users", icon: UserCog },
  { href: "/hub", label: "All apps", icon: LayoutGrid },
];

// Supervisors: the Production board and their timesheets.
export const SUPERVISOR_NAV: NavItem[] = [
  { href: "/production", label: "Production", icon: Kanban },
  { href: "/timesheets/admin", label: "Timesheets", icon: Clock },
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
  measures?: boolean;
  costing?: boolean;
}): NavItem[] {
  const items: NavItem[] = [{ href: "/sales/dashboard", label: "My sales", icon: LayoutDashboard }];
  if (access.salesAuthority) items.push({ href: "/sales", label: "Team sales", icon: TrendingUp });
  if (access.jobs) {
    items.push({ href: "/jobs", label: "Jobs", icon: Briefcase });
    items.push({ href: "/clients", label: "Clients", icon: Contact });
  }
  if (access.costing) items.push({ href: "/costing", label: "Costing", icon: Calculator });
  if (access.measures) items.push({ href: "/site-measures", label: "Measures", icon: Ruler });
  if (access.timesheets) items.push({ href: "/timesheets", label: "Timesheets", icon: Clock });
  if (access.orders) items.push({ href: "/orders", label: "Orders", icon: ShoppingCart });
  if (access.fleet) items.push({ href: "/fleet", label: "Fleet", icon: Truck });
  items.push({ href: "/hub", label: "All apps", icon: LayoutGrid });
  return items;
}

const tabClass =
  "flex items-center border-b-[3px] px-3 pt-[3px] text-sm font-medium whitespace-nowrap transition";
const tabIdle = "border-transparent text-[#C9D1DC] hover:bg-white/10 hover:text-white";

// Tabs that need attention (e.g. Absences with someone still needing a
// reason) show as white with a red border and a count.
type Alerts = Record<string, number>;
const alertTab =
  "my-3 flex items-center gap-1.5 whitespace-nowrap rounded-md border-2 border-[#B91C1C] bg-white px-2.5 text-sm font-semibold text-[#B91C1C] transition hover:bg-[#FDECEC]";

function AlertCount({ count }: { count: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#B91C1C] px-1.5 text-xs font-bold text-white">
      {count}
    </span>
  );
}

// Desktop: one row of links across the top bar, Xero style. Costing and
// Measures sit together in a drop-down tab,
// listed the same way as the phone menu.
function NavRow({ items, activeHref, alerts }: { items: NavItem[]; activeHref: string; alerts: Alerts }) {
  const inRow = items.filter((item) => !item.group);
  const measures = items.filter((item) => item.group);
  const dropdownAfter = items.findIndex((item) => item.group) - 1;

  return (
    <ul className="flex h-full items-stretch">
      {inRow.map((item) => {
        const active = item.href === activeHref;
        const alert = alerts[item.href] ?? 0;
        return (
          <Fragment key={item.href}>
            <li className="flex">
              {alert > 0 ? (
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={`${item.label} - ${alert} need${alert === 1 ? "s" : ""} attention`}
                  className={alertTab}
                >
                  {item.label}
                  <AlertCount count={alert} />
                </Link>
              ) : (
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`${tabClass} ${active ? "border-white text-white" : tabIdle}`}
                >
                  {item.label}
                </Link>
              )}
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
                <Link
                  href={item.href}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#C9D1DC] transition hover:bg-white/10 hover:text-white"
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </details>
    </li>
  );
}

// Phone and tablet: the same links in a drop-down list.
function NavList({ items, activeHref, alerts }: { items: NavItem[]; activeHref: string; alerts: Alerts }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.href === activeHref;
        const alert = alerts[item.href] ?? 0;
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                alert > 0
                  ? "border-2 border-[#B91C1C] bg-white font-semibold text-[#B91C1C]"
                  : active
                    ? "bg-white/15 font-semibold text-white"
                    : "text-[#C9D1DC] hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              {item.label}
              {alert > 0 && <AlertCount count={alert} />}
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
  "2xl": { row: "hidden px-8 2xl:block", menu: "group px-4 py-2.5 2xl:hidden" },
};

function breakpointFor(items: NavItem[]) {
  const tabs = items.filter((item) => !item.group).length + (items.some((item) => item.group) ? 1 : 0);
  if (tabs <= 5) return BREAKPOINTS.md;
  if (tabs <= 8) return BREAKPOINTS.lg;
  if (tabs <= 11) return BREAKPOINTS.xl;
  return BREAKPOINTS["2xl"];
}

export async function TopBar({ items, activeHref }: { items: NavItem[]; activeHref: string }) {
  // Only the admin bar has Absences.
  const isAdminBar = items.some((item) => item.href === "/absences");
  // The logo goes to the Hub for admins (the same on every page), and to
  // their own sales dashboard for sales staff.
  const home = isAdminBar ? "/hub" : items[0].href;
  const breakpoint = breakpointFor(items);
  // Opening any admin page also runs the "who hasn't clocked in" check
  // (see lib/absences/check.ts).
  // Also: timesheet hours waiting to go on jobs (Jobs), and people with
  // job hours but no hourly rate (Users).
  let alerts: Alerts = {};
  if (isAdminBar) {
    // Quotes undecided for 8 months go On Hold before anything is counted.
    await runAutoOnHold();
    const [absences, hours, toInvoice] = await Promise.all([
      pendingAbsenceCount(),
      hoursAlertCounts(),
      readyToInvoiceCount(),
    ]);
    alerts = { "/absences": absences, "/jobs": hours.waiting, "/users": hours.noRate, "/production": toInvoice };
  }
  const anyAlert = Object.values(alerts).some((n) => n > 0);
  return (
    <header className="sticky top-0 z-20 text-white shadow-sm" style={{ background: NAVY }}>
      {/* Wide enough for the row of tabs */}
      <div className={breakpoint.row}>
        <div className="mx-auto flex h-16 max-w-6xl 2xl:max-w-[92rem] items-stretch gap-6">
          <div className="flex items-center">
            <Logo href={home} className="w-28" />
          </div>
          <nav aria-label="Main" className="flex-1">
            <NavRow items={items} activeHref={activeHref} alerts={alerts} />
          </nav>
          <div className="flex items-center gap-1">
            <Link
              href="/settings"
              aria-label="Settings"
              title="Settings"
              className={`flex min-h-10 items-center rounded-lg px-2.5 hover:bg-white/10 hover:text-white ${
                activeHref === "/settings" ? "bg-white/10 text-white" : "text-[#C9D1DC]"
              }`}
            >
              <Settings className="h-5 w-5" />
            </Link>
            <Link
              href="/notifications"
              aria-label="Notifications"
              title="Notifications"
              className={`flex min-h-10 items-center rounded-lg px-2.5 hover:bg-white/10 hover:text-white ${
                activeHref === "/notifications" ? "bg-white/10 text-white" : "text-[#C9D1DC]"
              }`}
            >
              <Bell className="h-5 w-5" />
            </Link>
            <Link
              href="/profile"
              aria-label="Profile"
              title="Profile"
              className={`flex min-h-10 items-center rounded-lg px-2.5 hover:bg-white/10 hover:text-white ${
                activeHref === "/profile" ? "bg-white/10 text-white" : "text-[#C9D1DC]"
              }`}
            >
              <UserCircle className="h-5 w-5" />
            </Link>
            <SignOutButton className="min-h-10 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-[#C9D1DC] hover:bg-white/10 hover:text-white" />
          </div>
        </div>
      </div>

      {/* Narrower: menu button */}
      <details className={breakpoint.menu}>
        <summary className="flex list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <Logo href={home} className="w-24" />
          <span className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-[#2A3748] group-open:bg-white/10">
            <Menu className="h-5 w-5" aria-hidden />
            <span className="sr-only">Menu{anyAlert ? " - something needs attention" : ""}</span>
            {anyAlert && (
              <span aria-hidden className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full border-2 border-[#16202E] bg-[#EF4444]" />
            )}
          </span>
        </summary>
        <nav aria-label="Main" className="mt-3 border-t border-[#2A3748] pb-2 pt-3">
          <NavList items={items} activeHref={activeHref} alerts={alerts} />
          <Link
            href="/settings"
            className="mt-1 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#C9D1DC] hover:bg-white/10 hover:text-white"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <Link
            href="/notifications"
            className="mt-1 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#C9D1DC] hover:bg-white/10 hover:text-white"
          >
            <Bell className="h-4 w-4" />
            Notifications
          </Link>
          <Link
            href="/profile"
            className="mt-1 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#C9D1DC] hover:bg-white/10 hover:text-white"
          >
            <UserCircle className="h-4 w-4" />
            Profile
          </Link>
          <SignOutButton className="mt-1 min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-[#C9D1DC] hover:bg-white/10 hover:text-white" />
        </nav>
      </details>
    </header>
  );
}
