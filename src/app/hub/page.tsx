import Image from "next/image";
import Link from "next/link";
import { Clock, Truck, ClipboardList, ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";

export default async function HubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user?.id ?? "")
    .single();

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

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
        <AppTile
          href="https://platinum-painters-timesheets.vercel.app"
          external
          icon={<Clock className="h-5 w-5" />}
          title="Timesheets"
          description="Staff clock in/out, leave, and schedules."
        />
        <AppTile
          href="/fleet"
          icon={<Truck className="h-5 w-5" />}
          title="Fleet"
          description="Vehicles, fuel, servicing, and WOF/rego."
        />
        <AppTile
          href="/orders"
          icon={<ClipboardList className="h-5 w-5" />}
          title="Orders"
          description="Supplier orders by project, with line items and totals."
        />
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
      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-brand-red/10 text-brand-red">
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
