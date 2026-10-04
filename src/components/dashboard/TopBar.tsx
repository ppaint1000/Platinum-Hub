import { Fragment } from "react";
import { after } from "next/server";
import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  Inbox,
  Plus,
  Settings,
  Briefcase,
  Calculator,
  CalendarDays,
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
  Users,
  type LucideIcon,
} from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import { pendingAbsenceCount } from "@/lib/absences/check";
import { hoursAlertCounts } from "@/lib/jobs/hoursApproval";
import { readyToInvoiceCount, runAutoOnHold } from "@/lib/jobs/production";
import { runProposalFollowUps } from "@/lib/quotes/proposalFollowUps";
import { runBookingReminders } from "@/lib/schedule/customerEmails";
import { runClientReminders } from "@/lib/reminders/clientReminders";
import { NAVY } from "./parts";

// group: shown together in a desktop drop-down tab with that name.
export type NavItem = { href: string; label: string; icon: LucideIcon; external?: boolean; group?: string };

// Admins get every app, in the order the work flows.
export const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Contact },
  { href: "/requests", label: "Requests", icon: Inbox, group: "Quoting" },
  { href: "/site-measures", label: "Measures", icon: Ruler, group: "Quoting" },
  { href: "/costing", label: "Costing", icon: Calculator, group: "Quoting" },
  { href: "/sales", label: "Sales", icon: TrendingUp },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/production", label: "Production", icon: Kanban },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/orders", label: "Orders", icon: ShoppingCart, group: "Suppliers" },
  { href: "/jobs/invoices", label: "Invoices", icon: Receipt, group: "Suppliers" },
  { href: "/timesheets/admin", label: "Timesheets", icon: Clock, group: "Team" },
  { href: "/absences", label: "Absences", icon: CalendarX, group: "Team" },
  { href: "/users", label: "Users", icon: Users, group: "Team" },
  { href: "/fleet", label: "Fleet", icon: Truck },
  { href: "/reports", label: "Reports", icon: PieChart },
];

// Supervisors: the Production board and their timesheets.
export const SUPERVISOR_NAV: NavItem[] = [
  { href: "/production", label: "Production", icon: Kanban },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
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
  sales?: boolean;
  // Painters: just their own things (clock in, timesheet, fuel) - no Hub home.
  painter?: boolean;
}): NavItem[] {
  const items: NavItem[] = [];
  if (access.sales || access.salesAuthority) items.push({ href: "/sales/dashboard", label: "My sales", icon: LayoutDashboard });
  if (access.salesAuthority) items.push({ href: "/sales", label: "Team sales", icon: TrendingUp });
  if (access.jobs) {
    items.push({ href: "/jobs", label: "Jobs", icon: Briefcase });
    items.push({ href: "/clients", label: "Clients", icon: Contact });
  }
  if (access.measures || access.costing) items.push({ href: "/requests", label: "Requests", icon: Inbox });
  if (access.measures) items.push({ href: "/site-measures", label: "Measures", icon: Ruler });
  if (access.costing) items.push({ href: "/costing", label: "Costing", icon: Calculator });
  if (access.timesheets) {
    items.push({ href: "/timesheets/clock", label: "Clock in", icon: Clock });
    items.push({ href: "/timesheets/timesheet", label: "My timesheet", icon: CalendarX });
  }
  if (access.orders) items.push({ href: "/orders", label: "Orders", icon: ShoppingCart });
  if (access.fleet) {
    items.push(
      access.painter
        ? { href: "/fleet/log", label: "Log fuel", icon: Truck }
        : { href: "/fleet", label: "Fleet", icon: Truck }
    );
  }
  if (!access.painter) items.push({ href: "/hub", label: "All apps", icon: LayoutGrid });
  return items;
}

const NEW_ITEMS: { needs: string; href: string; label: string }[] = [
  { needs: "/requests", href: "/requests?new=1", label: "Request" },
  { needs: "/site-measures", href: "/site-measures?new=1", label: "Site measure" },
  { needs: "/costing", href: "/costing/new", label: "Costing" },
  { needs: "/clients", href: "/clients?new=1", label: "Client" },
  { needs: "/orders", href: "/orders/new", label: "Order" },
  { needs: "/fleet", href: "/fleet/log", label: "Fuel entry" },
];

function newItemsFor(items: NavItem[]) {
  return NEW_ITEMS.filter((n) => items.some((i) => i.href === n.needs));
}

function NewMenu({ items }: { items: NavItem[] }) {
  const options = newItemsFor(items);
  if (options.length === 0) return null;
  return (
    <details className="group relative">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-lg bg-[#1F4E8C] px-3 text-sm font-semibold text-white hover:bg-[#2A5FA6] [&::-webkit-details-marker]:hidden">
        <Plus className="h-4 w-4" aria-hidden />
        New
      </summary>
      <ul
        className="absolute right-0 top-full z-30 mt-1 flex min-w-44 flex-col gap-0.5 rounded-lg p-2 shadow-lg"
        style={{ background: NAVY }}
      >
        {options.map((o) => (
          <li key={o.href}>
            <Link
              href={o.href}
              className="flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-[#C9D1DC] hover:bg-white/10 hover:text-white"
            >
              {o.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

const tabClass =
  "flex items-center border-b-[3px] px-2 pt-[3px] text-[13px] font-medium whitespace-nowrap transition 2xl:px-3 2xl:text-sm";
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

// Desktop: one row of links across the top bar, Xero style. Grouped items
// (Quoting, Suppliers) sit together in a drop-down tab where the group's
// first item would be; the phone menu lists them all.
function NavRow({ items, activeHref, alerts }: { items: NavItem[]; activeHref: string; alerts: Alerts }) {
  return (
    <ul className="flex h-full items-stretch">
      {items.map((item, i) => {
        if (item.group) {
          if (items.findIndex((x) => x.group === item.group) !== i) return null;
          return (
            <GroupDropdown
              key={item.group}
              label={item.group}
              items={items.filter((x) => x.group === item.group)}
              activeHref={activeHref}
              alerts={alerts}
            />
          );
        }
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
          </Fragment>
        );
      })}
    </ul>
  );
}

function GroupDropdown({
  label,
  items,
  activeHref,
  alerts,
}: {
  label: string;
  items: NavItem[];
  activeHref: string;
  alerts: Alerts;
}) {
  const active = items.some((item) => item.href === activeHref);
  // Anything inside needing attention shows on the drop-down tab too.
  const alert = items.reduce((n, item) => n + (alerts[item.href] ?? 0), 0);
  return (
    <li className="relative flex">
      <details className="group flex">
        <summary
          aria-label={alert > 0 ? `${label} - ${alert} need${alert === 1 ? "s" : ""} attention` : undefined}
          className={`${
            alert > 0 ? alertTab : `${tabClass} ${active ? "border-white text-white" : tabIdle}`
          } cursor-pointer list-none gap-1 group-open:bg-white/10 group-open:text-white [&::-webkit-details-marker]:hidden`}
        >
          {label}
          {alert > 0 && <AlertCount count={alert} />}
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" aria-hidden />
        </summary>
        <ul
          className="absolute left-0 top-full z-30 flex min-w-52 flex-col gap-0.5 rounded-b-lg p-2 shadow-lg"
          style={{ background: NAVY }}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const count = alerts[item.href] ?? 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-[#C9D1DC] transition hover:bg-white/10 hover:text-white"
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  {item.label}
                  {count > 0 && (
                    <span className="ml-auto">
                      <AlertCount count={count} />
                    </span>
                  )}
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
  const tabs = items.filter((item) => !item.group).length + new Set(items.map((item) => item.group).filter(Boolean)).size;
  if (tabs <= 5) return BREAKPOINTS.md;
  if (tabs <= 8) return BREAKPOINTS.lg;
  // The admin menu (12 tabs, compact) fits across the top of a normal PC screen.
  if (tabs <= 12) return BREAKPOINTS.xl;
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
  // Proposal follow-ups and customer reminders, and the day-before booking
  // reminders, after the page is sent - never holds it up. Any signed-in
  // page load runs them (painters clock in every morning), each at most
  // every 15 minutes.
  after(runProposalFollowUps);
  after(runBookingReminders);
  after(runClientReminders);
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
        <div className="mx-auto flex h-16 max-w-[92rem] items-stretch gap-4 2xl:gap-6">
          <div className="flex items-center">
            <Logo href={home} className="w-28" />
          </div>
          <nav aria-label="Main" className="flex-1">
            <NavRow items={items} activeHref={activeHref} alerts={alerts} />
          </nav>
          <div className="flex items-center gap-1">
            <NewMenu items={items} />
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
            <SignOutButton className="min-h-10 whitespace-nowrap rounded-lg px-2 text-[13px] font-medium text-[#C9D1DC] hover:bg-white/10 hover:text-white 2xl:px-3 2xl:text-sm" />
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
          {newItemsFor(items).length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2 border-b border-[#2A3748] pb-3">
              {newItemsFor(items).map((o) => (
                <Link
                  key={o.href}
                  href={o.href}
                  className="flex min-h-10 items-center gap-1 rounded-lg bg-[#1F4E8C] px-3 text-sm font-semibold text-white"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  {o.label}
                </Link>
              ))}
            </div>
          )}
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
