"use client";

import { useEffect } from "react";
import { getUnsavedGuard } from "@/lib/quotes/unsavedGuard";
import { McAccessProvider } from "@/components/quotes/McAccess";
import type { McAccess } from "@/lib/quotes/mcAccess";

// The body of Costing and Site Measures. The Hub's top bar sits above it
// (see their layouts), and their own tabs inside. Leaving by any link -
// the top bar, the "+ New" menu, anything - asks first if an open costing
// has changes that haven't been saved (the Costing tabs ask in their own
// way, so they're skipped here: data-own-unsaved-check).
export function AdminShell({ access, children }: { access: McAccess; children: React.ReactNode }) {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as HTMLElement | null)?.closest("a[href]");
      if (!link || link.closest("[data-own-unsaved-check]")) return;
      const href = link.getAttribute("href") ?? "";
      if (href.startsWith("#") || link.getAttribute("target") === "_blank") return;
      if (getUnsavedGuard()?.isDirty() && !confirm("This costing has changes that haven't been saved. Leave without saving?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return (
    <McAccessProvider value={access}>
      <main className="min-w-0 px-4 py-6 md:px-8 md:py-8 print:p-0">{children}</main>
    </McAccessProvider>
  );
}
