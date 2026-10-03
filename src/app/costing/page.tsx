import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { QuoteRow } from "@/components/quotes/QuoteRow";
import { fetchMcOwners, requireMcAccess } from "@/lib/quotes/mcAccess";

export default async function CostingPage() {
  const supabase = await createClient();
  const access = await requireMcAccess("costing");
  // Admins see everyone's costings, and whose each one is.
  const owners = access.isAdmin ? await fetchMcOwners() : null;

  const { data: quotes } = await supabase
    .from("quotes")
    .select("id, status, valid_until, total, created_at, location, owner_id, customers:clients(name)")
    .order("created_at", { ascending: false });

  const list = quotes ?? [];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Costing</h1>
          <p className="mt-1 text-sm text-muted">
            {list.length} costing{list.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/costing/new"
          className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          New costing
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {list.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No costings yet. Create your first costing to get started.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Customer</th>
                <th className="hidden px-5 py-3 sm:table-cell">Location</th>
                {owners && <th className="px-5 py-3">Salesperson</th>}
                <th className="px-5 py-3">Status</th>
                <th className="hidden px-5 py-3 sm:table-cell">Valid until</th>
                <th className="px-5 py-3">Total</th>
                <th className="hidden px-5 py-3 md:table-cell">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {list.map((q) => (
                <QuoteRow
                  key={q.id}
                  quote={{
                    id: q.id,
                    status: q.status,
                    valid_until: q.valid_until,
                    total: q.total,
                    created_at: q.created_at,
                    location: q.location,
                    customerName:
                      (q.customers as unknown as { name: string } | null)?.name ?? "—",
                    ownerId: q.owner_id,
                  }}
                  owners={owners}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
