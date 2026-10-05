import Image from "next/image";
import Link from "next/link";
import {
  Settings,
  Inbox,
  Clock,
  Truck,
  ClipboardList,
  ArrowUpRight,
  Briefcase,
  Users,
  Ruler,
  Calculator,
  Contact,
  TrendingUp,
  LayoutDashboard,
  BellRing,
  CalendarDays,
  ShieldCheck,
  CalendarX,
  Receipt,
  Kanban,
  PieChart,
  AlertTriangle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { readyToInvoiceCount, runAutoOnHold } from "@/lib/jobs/production";

type AppAccess = {
  timesheets: boolean;
  fleet: boolean;
  orders: boolean;
  jobs: boolean;
  sales: boolean;
  measures: boolean;
  costing: boolean;
  production?: boolean;
  schedule?: boolean;
  safety?: boolean;
  invoices?: boolean;
};

export default async function HubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: access }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user?.id ?? "")
      .single(),
    supabase
      .from("user_app_access")
      .select("timesheets, fleet, orders, jobs, sales, measures, costing, production, schedule, safety, invoices")
      .eq("user_id", user?.id ?? "")
      .maybeSingle<AppAccess>(),
  ]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const isAdmin = profile?.role === "admin";
  const isSupervisor = profile?.role === "supervisor";
  // Admins: quotes gone quiet for 8 months go On Hold, and jobs at Job
  // completed are flagged here to invoice.
  let toInvoice = 0;
  if (isAdmin) {
    await runAutoOnHold();
    toInvoice = await readyToInvoiceCount();
  }

  type Tile = { href: string; icon: React.ReactNode; title: string; description: string; show: boolean };
  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: "Sales",
      tiles: [
        { href: "/dashboard", icon: <LayoutDashboard className="h-5 w-5" />, title: "Dashboard", description: "Sales, job margins, hours and fleet at a glance.", show: isAdmin },
        { href: "/requests", icon: <Inbox className="h-5 w-5" />, title: "Requests", description: "New enquiries from the website or a call - turn them into site measures.", show: isAdmin || !!access?.measures || !!access?.costing },
        { href: "/clients", icon: <Contact className="h-5 w-5" />, title: "Clients", description: "Every client, their contacts, jobs and clock-in sites.", show: isAdmin || !!access?.jobs },
        { href: "/reminders", icon: <BellRing className="h-5 w-5" />, title: "Repaint reminders", description: "Check-ups and repaints coming due for past clients.", show: isAdmin },
        { href: "/site-measures", icon: <Ruler className="h-5 w-5" />, title: "Site Measures", description: "Measure up on site, then send it to a costing.", show: isAdmin || !!access?.measures },
        { href: "/costing", icon: <Calculator className="h-5 w-5" />, title: "Costing and proposals", description: "Price the job and send the customer an online proposal.", show: isAdmin || !!access?.costing },
        { href: "/sales", icon: <TrendingUp className="h-5 w-5" />, title: "Sales", description: "Quoted and won $ by salesperson, against a monthly budget.", show: isAdmin || !!access?.sales },
      ],
    },
    {
      title: "Jobs",
      tiles: [
        { href: "/jobs", icon: <Briefcase className="h-5 w-5" />, title: "Jobs", description: "Pipeline, budgets, and budget-vs-actual by job.", show: isAdmin || !!access?.jobs },
        { href: "/production", icon: <Kanban className="h-5 w-5" />, title: "Production board", description: "Won jobs from To be scheduled through to Paid.", show: isAdmin || !!access?.production },
        { href: "/schedule", icon: <CalendarDays className="h-5 w-5" />, title: "Schedule", description: "Which crew is on which job, week by week.", show: isAdmin || !!access?.schedule },
        { href: "/orders", icon: <ClipboardList className="h-5 w-5" />, title: "Orders", description: "Supplier orders by job, with line items and totals.", show: isAdmin || !!access?.orders },
        { href: "/jobs/invoices", icon: <Receipt className="h-5 w-5" />, title: "Supplier invoices", description: "Upload supplier invoices and put their lines against jobs.", show: isAdmin || !!access?.invoices },
      ],
    },
    {
      title: "Team",
      tiles: [
        { href: "/timesheets", icon: <Clock className="h-5 w-5" />, title: "Timesheets", description: "Clock in and out, timesheets and sites.", show: isAdmin || !!access?.timesheets },
        { href: "/absences", icon: <CalendarX className="h-5 w-5" />, title: "Absences", description: "Who's been away and why - sick days, leave and patterns.", show: isAdmin },
        { href: "/safety", icon: <ShieldCheck className="h-5 w-5" />, title: "Health & safety", description: "Hazard reports, incidents, toolbox meetings, tasks and safety documents.", show: isAdmin || !!access?.safety },
        { href: "/fleet", icon: <Truck className="h-5 w-5" />, title: "Fleet", description: "Vehicles, fuel, servicing, and WOF/rego.", show: isAdmin || !!access?.fleet },
      ],
    },
    {
      title: "Reports and set-up",
      tiles: [
        { href: "/reports", icon: <PieChart className="h-5 w-5" />, title: "Reports", description: "Every report in one place, with charts and export.", show: isAdmin },
        { href: "/users", icon: <Users className="h-5 w-5" />, title: "Users and access", description: "Add and manage staff, what they can use, and where they land.", show: isAdmin },
        { href: "/settings", icon: <Settings className="h-5 w-5" />, title: "Settings", description: "Rates, templates, checklists, sites, vehicles - all set-up in one place.", show: true },
      ],
    },
  ];
  const sections = groups
    .map((g) => ({ title: g.title, tiles: g.tiles.filter((t) => t.show) }))
    .filter((g) => g.tiles.length > 0);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.webp"
            alt="Platinum Painters"
            width={160}
            height={64}
            priority
            className="h-10 w-auto"
          />
          <div className="h-8 w-px bg-border" />
          <span className="text-sm font-semibold uppercase tracking-wide text-muted">
            Hub
          </span>
        </div>
        <div className="flex items-center gap-4">
          {(isAdmin || isSupervisor || access?.sales) && (
            <Link href="/notifications" className="text-sm font-medium text-muted transition hover:text-ink">
              Notifications
            </Link>
          )}
          <Link href="/profile" className="text-sm font-medium text-muted transition hover:text-ink">
            Profile
          </Link>
          <SignOutButton className="text-sm font-medium text-muted transition hover:text-ink" />
        </div>
      </header>

      <div className="mt-10">
        <h1 className="text-2xl font-semibold text-ink">Hi {firstName}</h1>
        <p className="mt-1 text-sm text-muted">
          Everything for the business, in one place.
        </p>
      </div>

      {toInvoice > 0 && (
        <Link
          href="/production"
          role="alert"
          className="mt-6 flex items-center gap-3 rounded-xl bg-[#B91C1C] px-4 py-3 text-sm text-white hover:bg-[#991B1B]"
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span className="font-semibold">
            {toInvoice} job{toInvoice === 1 ? "" : "s"} completed - ready to invoice
          </span>
          <span className="ml-auto font-semibold underline underline-offset-2">Production →</span>
        </Link>
      )}

      {/* In the order the work flows, like PaintScout's menu: win the work,
          run the jobs, look after the team, then reports and set-up. */}
      {sections.map((sec) => (
        <section key={sec.title} aria-label={sec.title} className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{sec.title}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {sec.tiles.map((t) => (
              <AppTile key={t.href} href={t.href} icon={t.icon} title={t.title} description={t.description} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function AppTile({
  href,
  icon,
  title,
  description,
  external,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="group flex items-start gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm transition hover:border-brand-red/40 hover:shadow-md"
    >
      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-brand-red text-white">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h2 className="font-semibold text-ink">{title}</h2>
          <ArrowUpRight className="h-3.5 w-3.5 text-muted opacity-0 transition group-hover:opacity-100" />
        </div>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
    </Link>
  );
}
