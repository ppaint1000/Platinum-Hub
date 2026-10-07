"use client";

// Admins' left-hand menu (as well as the tabs across the top): every page
// grouped by area, opened or closed with the button left of the logo. It
// stays open or closed as you move between pages (remembered on this
// computer), and pushes the page over rather than covering it.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  LineChart,
  BellRing,
  Briefcase,
  Calculator,
  CalendarDays,
  CalendarX,
  Clock,
  Contact,
  Home,
  Inbox,
  Kanban,
  Mail,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Receipt,
  Ruler,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

type Link_ = { href: string; label: string; icon: LucideIcon };

const GROUPS: { title: string; links: Link_[] }[] = [
  {
    title: "Home",
    links: [
      { href: "/hub", label: "Hub home", icon: Home },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Sales",
    links: [
      { href: "/clients", label: "Clients", icon: Contact },
      { href: "/requests", label: "Requests", icon: Inbox },
      { href: "/site-measures", label: "Site measures", icon: Ruler },
      { href: "/costing", label: "Costing", icon: Calculator },
      { href: "/sales", label: "Sales", icon: TrendingUp },
      { href: "/reminders", label: "Repaint reminders", icon: BellRing },
      { href: "/drips", label: "Drips & reviews", icon: Mail },
    ],
  },
  {
    title: "Jobs",
    links: [
      { href: "/jobs", label: "Jobs", icon: Briefcase },
      { href: "/jobs/live", label: "Live jobs", icon: Activity },
      { href: "/jobs/forecast", label: "Forecast", icon: LineChart },
      { href: "/production", label: "Production", icon: Kanban },
      { href: "/schedule", label: "Schedule", icon: CalendarDays },
      { href: "/safety", label: "Health & safety", icon: ShieldCheck },
      { href: "/orders", label: "Orders", icon: ShoppingCart },
      { href: "/jobs/invoices", label: "Supplier invoices", icon: Receipt },
    ],
  },
  {
    title: "Team",
    links: [
      { href: "/timesheets/admin", label: "Timesheets", icon: Clock },
      { href: "/absences", label: "Absences", icon: CalendarX },
      { href: "/users", label: "Users", icon: Users },
      { href: "/fleet", label: "Fleet", icon: Truck },
    ],
  },
  {
    title: "More",
    links: [
      { href: "/reports", label: "Reports", icon: PieChart },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const KEY = "pp-side-panel";

export function SidePanel() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Remembered on this computer; may be unavailable (private window).
  useEffect(() => {
    let saved = false;
    try {
      saved = localStorage.getItem(KEY) === "open";
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.sidePanel = open ? "open" : "closed";
    return () => {
      delete document.documentElement.dataset.sidePanel;
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(KEY, next ? "open" : "closed");
    } catch {}
  }

  // The most specific link that matches this page is the one shown as here.
  const all = GROUPS.flatMap((g) => g.links);
  const current = all
    .filter((l) => pathname === l.href || pathname.startsWith(l.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="side-panel"
        title={open ? "Close the side menu" : "Open the side menu"}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-[#C9D1DC] hover:bg-white/10 hover:text-white"
      >
        {open ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
        <span className="sr-only">{open ? "Close the side menu" : "Open the side menu"}</span>
      </button>

      {open && (
        <nav
          id="side-panel"
          aria-label="Side menu"
          className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col overflow-y-auto border-r border-[#2A3748] bg-[#16202E] pb-6 text-white print:hidden"
        >
          <div className="flex h-16 shrink-0 items-center justify-between px-4">
            <span className="text-sm font-semibold text-[#C9D1DC]">Menu</span>
            <button
              type="button"
              onClick={toggle}
              aria-label="Close the side menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#C9D1DC] hover:bg-white/10 hover:text-white"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </div>
          {GROUPS.map((g) => (
            <div key={g.title} className="mt-3 px-3">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8A99AD]">{g.title}</p>
              <ul className="flex flex-col gap-0.5">
                {g.links.map((l) => {
                  const Icon = l.icon;
                  const here = l.href === current;
                  return (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        // Smaller screens: it sits over the page, so it closes once you pick one.
                        onClick={() => window.innerWidth < 1600 && toggle()}
                        aria-current={here ? "page" : undefined}
                        className={`flex min-h-10 items-center gap-3 rounded-lg px-2 text-sm font-medium transition ${
                          here ? "bg-white/15 font-semibold text-white" : "text-[#C9D1DC] hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                        {l.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      )}
    </>
  );
}
