import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Truck,
  Fuel,
  Wrench,
  ShieldCheck,
  Users,
  ArrowLeft,
  Plus,
} from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import { NavLink } from "@/components/fleet/NavLink";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";

const NAV = [
  { href: "/fleet", label: "Dashboard", icon: LayoutDashboard },
  { href: "/fleet/vehicles", label: "Vehicles", icon: Truck },
  { href: "/fleet/fuel", label: "Fuel Log", icon: Fuel },
  { href: "/fleet/servicing", label: "Servicing", icon: Wrench },
  { href: "/fleet/compliance", label: "WOF & Rego", icon: ShieldCheck },
  { href: "/fleet/drivers", label: "Drivers", icon: Users },
];

export default async function FleetAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await requireAppAccess("fleet");

  // The Fleet admin area is for admins (full control) and supervisors
  // (view-only - see canEditFleet). Anyone else with Fleet access, e.g. a
  // painter, only logs fuel, so they go straight to the fuel form.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();
  if (profile?.role !== "admin" && profile?.role !== "supervisor") {
    redirect("/fleet/log");
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <nav className="flex flex-col gap-1 border-b border-border bg-surface px-3 py-4 md:w-56 md:flex-none md:border-b-0 md:border-r md:px-3 md:py-5">
        <div className="flex items-center justify-between px-2 pb-3 md:block md:pb-5">
          <Image
            src="/logo.webp"
            alt="Platinum Painters"
            width={140}
            height={56}
            className="h-8 w-auto"
          />
          <Link
            href="/hub"
            className="flex items-center gap-1 text-xs font-medium text-muted transition hover:text-ink md:hidden"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Hub
          </Link>
        </div>

        <Link
          href="/hub"
          className="mb-2 hidden items-center gap-1.5 px-2 text-xs font-medium text-muted transition hover:text-ink md:flex"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Hub
        </Link>

        <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {/* The driver entry form (/fleet/log) lives outside this admin
              layout, so nothing else in the Hub links to it. */}
          <Link
            href="/fleet/log"
            className="flex flex-none items-center gap-2.5 rounded-lg bg-ink px-2.5 py-2 text-sm font-semibold text-white transition hover:bg-black md:mb-2 md:flex-auto"
          >
            <Plus className="h-4 w-4" />
            <span className="whitespace-nowrap">Log fuel</span>
          </Link>
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href}>
              <item.icon className="h-4 w-4" />
              <span className="whitespace-nowrap">{item.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="mt-auto hidden pt-4 md:block">
          <SignOutButton className="px-2 text-xs font-medium text-muted transition hover:text-ink" />
        </div>
      </nav>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  );
}
