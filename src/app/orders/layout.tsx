import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata: Metadata = {
  title: "Platinum Painters Orders",
};

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-4 md:px-8">
        <div className="flex items-center gap-3">
          <Image
            src="/logo.webp"
            alt="Platinum Painters"
            width={140}
            height={56}
            className="h-8 w-auto"
          />
          <Link
            href="/hub"
            className="flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Hub
          </Link>
        </div>
        <SignOutButton className="text-sm font-medium text-muted transition hover:text-ink" />
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
