"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Users } from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import { getUnsavedGuard } from "@/lib/quotes/unsavedGuard";
import { McAccessProvider } from "@/components/quotes/McAccess";
import type { McAccess } from "@/lib/quotes/mcAccess";

const buttonClass =
  "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition";
const idleClass = "border-border bg-surface text-ink hover:bg-background";

// Costing and Site Measures switch via their own tabs, so the top bar only
// carries the logo and the few things that live outside them: Clients (for
// those with the Jobs app), back to the Hub, and Sign out.
export function AdminShell({ access, children }: { access: McAccess; children: React.ReactNode }) {
  // Leaving for Clients or the Hub is a client-side navigation, which
  // doesn't trigger the browser's own "leave site?" warning, so ask before
  // dropping an open costing's unsaved changes.
  function onLeaveClick(e: React.MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (
      getUnsavedGuard()?.isDirty() &&
      !confirm("This costing has changes that haven't been saved. Leave without saving?")
    ) {
      e.preventDefault();
    }
  }

  return (
    <McAccessProvider value={access}>
      <div className="min-h-screen">
        <main className="min-w-0 px-4 py-6 md:px-8 md:py-8 print:p-0">
          {/* The app's own header isn't printed (e.g. a work order). */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
            <Image
              src="/measures-logo.webp"
              alt="Platinum Painters"
              width={140}
              height={56}
              priority
              className="h-7 w-auto"
            />
            <div className="flex items-center gap-1.5">
              {access.jobs && (
                <Link href="/clients" onClick={onLeaveClick} className={`${buttonClass} ${idleClass}`}>
                  <Users className="h-3.5 w-3.5" />
                  Clients
                </Link>
              )}
              <Link href="/hub" onClick={onLeaveClick} className={`${buttonClass} ${idleClass}`}>
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Hub
              </Link>
              <SignOutButton className={`${buttonClass} ${idleClass}`} />
            </div>
          </div>
          {children}
        </main>
      </div>
    </McAccessProvider>
  );
}
