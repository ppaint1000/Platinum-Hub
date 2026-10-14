"use client";

// "Check Xero now": bring in customer invoices raised in Xero since the
// last check (it also runs every morning).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { checkXeroNowAction } from "@/app/jobs/xero-actions";

export function CheckXeroButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; bad?: boolean; reconnect?: boolean; unmatched?: number; unmatchedBills?: number } | null>(null);

  function check() {
    setMessage(null);
    startTransition(async () => {
      const r = await checkXeroNowAction();
      if (r.error) {
        setMessage({ text: r.error, bad: true, reconnect: /reconnect/i.test(r.error) });
        return;
      }
      const parts = [
        r.added && `${r.added} new invoice${r.added === 1 ? "" : "s"}`,
        r.updated && `${r.updated} updated`,
        r.removed && `${r.removed} removed (draft or voided)`,
        r.paidJobs && `${r.paidJobs} job${r.paidJobs === 1 ? "" : "s"} moved to Paid`,
        r.bills?.added && `${r.bills.added} bill${r.bills.added === 1 ? "" : "s"} added to job costs`,
        r.bills?.updated && `${r.bills.updated} bill${r.bills.updated === 1 ? "" : "s"} updated`,
        r.bills?.removed && `${r.bills.removed} bill${r.bills.removed === 1 ? "" : "s"} taken off`,
        r.docs?.moved && `${r.docs.moved} email logo${r.docs.moved === 1 ? "" : "s"} tidied out of Documents`,
      ].filter(Boolean);
      setMessage({
        text:
          (parts.length ? parts.join(", ") + "." : "Up to date - nothing new in Xero.") +
          (r.docs?.needsReconnect ? ` ${r.docs.error}` : r.docs?.error ? ` (Documents tidy: ${r.docs.error})` : ""),
        reconnect: !!r.docs?.needsReconnect,
        unmatched: r.unmatched,
        unmatchedBills: r.bills?.unmatched,
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={check}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-md border border-[#13B5EA] px-3 py-1.5 text-sm font-semibold text-[#0E7FA6] hover:bg-sky-50 disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
        {pending ? "Checking Xero…" : "Check Xero now"}
      </button>
      {message && (
        <span className={`text-sm ${message.bad ? "text-red-700" : "text-ink-soft"}`}>
          {message.text}
          {message.reconnect && (
            <>
              {" "}
              <a href="/api/xero/connect" className="font-semibold underline">
                Reconnect Xero
              </a>
            </>
          )}
          {!!message.unmatchedBills && (
            <>
              {" "}
              <Link href="/jobs/xero-bills" className="font-semibold text-amber-700 underline">
                {message.unmatchedBills} bill{message.unmatchedBills === 1 ? "" : "s"} need a job
              </Link>
            </>
          )}
          {!!message.unmatched && (
            <>
              {" "}
              <Link href="/jobs/xero-invoices" className="font-semibold text-amber-700 underline">
                {message.unmatched} invoice{message.unmatched === 1 ? "" : "s"} need a job
              </Link>
            </>
          )}
        </span>
      )}
    </div>
  );
}
