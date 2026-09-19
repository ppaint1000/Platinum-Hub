import Image from "next/image";
import Link from "next/link";
import {
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
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

type AppAccess = {
  timesheets: boolean;
  fleet: boolean;
  orders: boolean;
  jobs: boolean;
  sales: boolean;
};

// Deployed as "platinum-quotes" on Vercel — the app itself was renamed to
// Measures, but the Vercel project/URL wasn't. Override via
// NEXT_PUBLIC_MEASURES_URL if that ever changes. Both the Costing and
// Measures tiles point into this one app (/costing and /site-measures).
const MEASURES_URL = (
  process.env.NEXT_PUBLIC_MEASURES_URL ?? "https://platinum-quotes.vercel.app"
).replace(/\/$/, "");

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
      .select("timesheets, fleet, orders, jobs, sales")
      .eq("user_id", user?.id ?? "")
      .maybeSingle<AppAccess>(),
  ]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const isAdmin = profile?.role === "admin";

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
        <SignOutButton className="text-sm font-medium text-muted transition hover:text-ink" />
      </header>

      <div className="mt-10">
        <h1 className="text-2xl font-semibold text-ink">Hi {firstName}</h1>
        <p className="mt-1 text-sm text-muted">
          Everything for the business, in one place.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(isAdmin || access?.timesheets) && (
          <AppTile
            href="/timesheets"
            icon={<Clock className="h-5 w-5" />}
            title="Timesheets"
            description="Staff clock in/out, leave, and schedules."
          />
        )}
        {(isAdmin || access?.fleet) && (
          <AppTile
            href="/fleet"
            icon={<Truck className="h-5 w-5" />}
            title="Fleet"
            description="Vehicles, fuel, servicing, and WOF/rego."
          />
        )}
        {(isAdmin || access?.orders) && (
          <AppTile
            href="/orders"
            icon={<ClipboardList className="h-5 w-5" />}
            title="Orders"
            description="Supplier orders by project, with line items and totals."
          />
        )}
        {(isAdmin || access?.jobs) && (
          <AppTile
            href="/jobs"
            icon={<Briefcase className="h-5 w-5" />}
            title="Jobs"
            description="Pipeline, budgets, and budget-vs-actual by job."
          />
        )}
        {(isAdmin || access?.jobs) && (
          <AppTile
            href="/clients"
            icon={<Contact className="h-5 w-5" />}
            title="Clients"
            description="Customer and contact details behind every job."
          />
        )}
        {(isAdmin || access?.sales) && (
          <AppTile
            href="/sales"
            icon={<TrendingUp className="h-5 w-5" />}
            title="Sales"
            description="Quoted and won $ by salesperson, against a monthly budget."
          />
        )}
        {isAdmin && (
          <AppTile
            href={`${MEASURES_URL}/costing`}
            external
            icon={<Calculator className="h-5 w-5" />}
            title="Costing"
            description="Job costings."
          />
        )}
        {isAdmin && (
          <AppTile
            href={`${MEASURES_URL}/site-measures`}
            external
            icon={<Ruler className="h-5 w-5" />}
            title="Measures"
            description="Site measures."
          />
        )}
        {isAdmin && (
          <AppTile
            href="/users"
            icon={<Users className="h-5 w-5" />}
            title="Users"
            description="Add, deactivate, or delete staff and set app access."
          />
        )}
      </div>
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
