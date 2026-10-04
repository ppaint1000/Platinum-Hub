"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { lastCostingId, rememberCosting } from "@/lib/quotes/lastCosting";
import { getUnsavedGuard } from "@/lib/quotes/unsavedGuard";
import { useMcAccess } from "@/components/quotes/McAccess";

const SIBLING_PREFIXES = [
  "/costing/rates",
  "/costing/paint-products",
  "/costing/resene-prices",
  "/costing/production-rates",
  "/costing/access",
  "/costing/proposal-templates",
];

const BASE_TABS = [
  { href: "/costing", label: "Costings" },
  { href: "/costing/rates", label: "Rates" },
  { href: "/costing/paint-products", label: "Paint Products" },
  { href: "/costing/resene-prices", label: "Resene Paint Prices" },
  { href: "/costing/production-rates", label: "Production Rates" },
  { href: "/costing/access", label: "Access Equipment" },
  { href: "/costing/proposal-templates", label: "Proposal templates" },
];

// A way across to the other half of the app, so Costing and Site Measures
// can be jumped between without the sidebar.
const SITE_MEASURES_TAB = { href: "/site-measures", label: "Site Measures" };

// Matches /costing/<quote-id>, /summary, /work-order or /proposal — anything
// else under /costing (the list, "new", or the fixed admin pages above)
// isn't a specific quote, so there's nothing to summarize.
const QUOTE_ROUTE = /^\/costing\/([0-9a-f-]{36})(?:\/(?:summary|work-order|proposal))?$/i;

const buttonBase =
  "flex-none whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-sm font-semibold transition";

export function CostingSubNav() {
  const pathname = usePathname();
  const router = useRouter();
  const access = useMcAccess();
  // Just the costings here (and Site Measures, to go back and forth) - the
  // rates, price lists and proposal templates live in Settings, like
  // PaintScout.
  const baseTabs = BASE_TABS.slice(0, 1);
  const quoteMatch = pathname.match(QUOTE_ROUTE);
  const quoteId = quoteMatch ? quoteMatch[1] : null;

  const onSiblingPage = SIBLING_PREFIXES.some((p) => pathname.startsWith(p));
  useEffect(() => {
    if (quoteId) rememberCosting(quoteId);
  }, [quoteId]);
  // Read fresh on every render (this nav stays mounted while you move
  // between tabs); the server render has no storage, so it starts empty.
  const remembered = useSyncExternalStore(
    () => () => {},
    lastCostingId,
    () => null
  );
  const backId = onSiblingPage ? remembered : null;

  // Clicking away from a costing with unsaved changes asks first.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [savingBeforeLeave, setSavingBeforeLeave] = useState(false);

  function onTabClick(e: React.MouseEvent, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || href === pathname) return;
    const guard = getUnsavedGuard();
    if (guard?.isDirty()) {
      e.preventDefault();
      setPendingHref(href);
    }
  }

  async function saveAndLeave() {
    if (!pendingHref) return;
    setSavingBeforeLeave(true);
    const ok = await getUnsavedGuard()?.save();
    setSavingBeforeLeave(false);
    const href = pendingHref;
    setPendingHref(null);
    if (ok) router.push(href);
  }

  function leaveWithoutSaving() {
    if (!pendingHref) return;
    getUnsavedGuard()?.discard();
    const href = pendingHref;
    setPendingHref(null);
    router.push(href);
  }

  const tabs = [
    ...(quoteId
      ? [
          baseTabs[0],
          { href: `/costing/${quoteId}`, label: "Edit costing" },
          { href: `/costing/${quoteId}/summary`, label: "Summary" },
          { href: `/costing/${quoteId}/work-order`, label: "Work order" },
          { href: `/costing/${quoteId}/proposal`, label: "Proposal" },
          ...baseTabs.slice(1),
        ]
      : baseTabs),
    ...(access.measures ? [SITE_MEASURES_TAB] : []),
  ];

  function isActive(href: string) {
    if (quoteId && href === `/costing/${quoteId}`) return pathname === href;
    if (href === "/costing") {
      return (
        pathname === "/costing" ||
        (!quoteId &&
          pathname.startsWith("/costing/") &&
          !SIBLING_PREFIXES.some((p) => pathname.startsWith(p)))
      );
    }
    return pathname.startsWith(href);
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden" data-own-unsaved-check>
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            onClick={(e) => onTabClick(e, tab.href)}
            className={`${buttonBase} ${
              isActive(tab.href)
                ? "border-ink bg-ink text-white"
                : "border-border bg-surface text-ink hover:bg-background"
            }`}
          >
            {tab.label}
          </Link>
        ))}
        {access.isAdmin && !backId && (
          <Link
            href="/settings#pricing-and-costing"
            onClick={(e) => onTabClick(e, "/settings")}
            className={`${buttonBase} ml-auto border-border bg-surface text-muted hover:bg-background hover:text-ink`}
          >
            Rates &amp; settings
          </Link>
        )}
        {backId && (
          <Link
            href={`/costing/${backId}`}
            className={`${buttonBase} ml-auto flex items-center gap-1.5 border-brand-red bg-brand-red text-white hover:bg-brand-red-dark`}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to costing
          </Link>
        )}
      </div>

      {pendingHref && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 py-[20vh]"
          onClick={(e) => e.target === e.currentTarget && !savingBeforeLeave && setPendingHref(null)}
        >
          <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-ink">Save your changes?</h3>
            <p className="mt-1.5 text-sm text-muted">
              This costing has changes that haven&apos;t been saved.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingHref(null)}
                disabled={savingBeforeLeave}
                className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition hover:bg-background disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={leaveWithoutSaving}
                disabled={savingBeforeLeave}
                className="rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-brand-red-dark transition hover:bg-background disabled:opacity-60"
              >
                Don&apos;t save
              </button>
              <button
                type="button"
                onClick={saveAndLeave}
                disabled={savingBeforeLeave}
                className="rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
              >
                {savingBeforeLeave ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
