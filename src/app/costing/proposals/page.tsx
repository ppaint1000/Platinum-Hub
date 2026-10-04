// Proposals — every online proposal in one list (like PaintScout's
// Estimates): who it's for, where it's up to, and links to it. Non-admins
// only see the proposals on their own costings (the database checks this).
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtCurrency, fmtDate } from "@/lib/quotes/format";

type Row = {
  id: string;
  quote_id: string;
  token: string;
  access_code: string | null;
  sent_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  accepted_at: string | null;
  accepted_name: string | null;
  accepted_total: number | null;
  declined_at: string | null;
  declined_reason: string | null;
  expires_on: string | null;
  pricing: { total?: number } | null;
  updated_at: string;
  quotes: { location: string | null; project: string | null; customers: { name: string } | null } | null;
};

function stage(p: Row): { label: string; className: string } {
  if (p.accepted_at) return { label: "Accepted", className: "bg-green-50 text-green-800" };
  if (p.declined_at) return { label: "Declined", className: "bg-red-50 text-brand-red" };
  if (p.expires_on && p.expires_on < new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" }))
    return { label: "Expired", className: "bg-border/50 text-muted" };
  if (p.view_count > 0)
    return { label: `Opened ${p.view_count}×`, className: "bg-blue-50 text-blue-800" };
  if (p.sent_at) return { label: "Sent", className: "bg-amber-50 text-amber-800" };
  return { label: "Not sent yet", className: "bg-border/50 text-muted" };
}

export default async function ProposalsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("proposals")
    .select(
      "id, quote_id, token, access_code, sent_at, last_viewed_at, view_count, accepted_at, accepted_name, accepted_total, declined_at, declined_reason, expires_on, pricing, updated_at, quotes(location, project, customers:clients(name))"
    )
    .order("updated_at", { ascending: false })
    .returns<Row[]>();
  const rows = data ?? [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Proposals</h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length} proposal{rows.length === 1 ? "" : "s"}. A proposal is made from its costing (Costing → open a costing →
          Proposal).
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No proposals yet. Open a costing and use its Proposal tab to make one.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Job</th>
                <th className="px-5 py-3">Where it&apos;s up to</th>
                <th className="hidden px-5 py-3 md:table-cell">Sent</th>
                <th className="hidden px-5 py-3 md:table-cell">Last opened</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="hidden px-5 py-3 lg:table-cell">Code</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const s = stage(p);
                const total = p.accepted_total ?? p.pricing?.total ?? null;
                return (
                  <tr key={p.id} className="border-b border-border last:border-b-0 hover:bg-background">
                    <td className="whitespace-nowrap px-5 py-3 font-medium text-ink">{p.quotes?.customers?.name ?? "—"}</td>
                    <td className="px-5 py-3 text-muted">{p.quotes?.location ?? p.quotes?.project ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.className}`}>{s.label}</span>
                      {p.accepted_name && <span className="ml-2 text-xs text-muted">by {p.accepted_name}</span>}
                      {p.declined_reason && <span className="ml-2 text-xs text-muted">{p.declined_reason}</span>}
                    </td>
                    <td className="hidden whitespace-nowrap px-5 py-3 text-muted md:table-cell">{fmtDate(p.sent_at)}</td>
                    <td className="hidden whitespace-nowrap px-5 py-3 text-muted md:table-cell">{fmtDate(p.last_viewed_at)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-medium">
                      {total === null ? "—" : `${fmtCurrency(total)} + GST`}
                    </td>
                    <td className="hidden whitespace-nowrap px-5 py-3 font-mono text-muted lg:table-cell">{p.access_code ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <Link href={`/costing/${p.quote_id}/proposal`} className="font-semibold text-brand-red-dark hover:underline">
                        Open
                      </Link>
                      <a
                        href={`/p/${p.token}?preview=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-4 text-muted hover:text-ink hover:underline"
                      >
                        Customer view
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
