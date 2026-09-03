"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = href === "/fleet" ? pathname === "/fleet" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`flex flex-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition md:flex-auto ${
        active
          ? "bg-brand-red/10 text-brand-red-dark"
          : "text-muted hover:bg-background hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
