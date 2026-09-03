import Image from "next/image";
import Link from "next/link";
import {
  LayoutDashboard,
  Truck,
  Fuel,
  Wrench,
  ShieldCheck,
  Users,
  ArrowLeft,
} from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import { NavLink } from "@/components/fleet/NavLink";

const NAV = [
  { href: "/fleet", label: "Dashboard", icon: LayoutDashboard },
  { href: "/fleet/vehicles", label: "Vehicles", icon: Truck },
  { href: "/fleet/fuel", label: "Fuel Log", icon: Fuel },
  { href: "/fleet/servicing", label: "Servicing", icon: Wrench },
  { href: "/fleet/compliance", label: "WOF & Rego", icon: ShieldCheck },
  { href: "/fleet/drivers", label: "Drivers", icon: Users },
];

export default function FleetAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
