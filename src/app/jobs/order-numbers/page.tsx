// Log an order - the order number from the paper order book page and the job
// it's for. When the supplier's bill arrives in Xero quoting that order
// number, it goes onto the job's costs. Admins, and anyone with "Log an
// order" ticked on Users -> Page access.
import Link from "next/link";
import { redirect } from "next/navigation";
import { canLogOrders } from "./access";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderNumberForm, RemoveOrderNumber } from "./order-form";

export default async function OrderNumbersPage() {
  const access = await canLogOrders();
  if (!access.ok) redirect("/hub");
  const db = createAdminClient();
  const [{ data: jobs }, { data: recent }] = await Promise.all([
    db
      .from("jobs")
      .select("id, job_number, name, client:clients(name)")
      .in("status", ["won", "scheduled", "in_progress", "complete"])
      .order("job_number", { ascending: false })
      .returns<{ id: string; job_number: string | null; name: string; client: { name: string } | null }[]>(),
    db
      .from("job_order_numbers")
      .select("id, order_number, created_at, jobs(job_number, name)")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);
  const jobOptions = (jobs ?? []).map((j) => ({ id: j.id, label: `${j.job_number ?? ""} ${j.name}${j.client?.name ? ` (${j.client.name})` : ""}`.trim() }));

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-8">
      {access.admin && (
        <Link href="/jobs/xero-bills" className="text-sm font-medium text-ink-soft hover:text-ink">
          ← Xero bills
        </Link>
      )}
      <h1 className="mt-2 text-3xl font-bold text-ink">Log an order</h1>
      <p className="mb-6 mt-1 text-sm text-ink-soft">
        When you place an order from the order book, enter the order number from that page and the job it&apos;s for. When the supplier&apos;s bill comes into Xero
        with that order number, it goes straight onto the job&apos;s costs.
      </p>
      <OrderNumberForm jobOptions={jobOptions} />

      <h2 className="mb-2 mt-10 text-sm font-semibold uppercase tracking-wide text-ink-faint">Recently logged</h2>
      {(recent ?? []).length === 0 ? (
        <p className="text-sm text-ink-soft">No orders logged yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-paper-raised text-sm">
          {(recent ?? []).map((r) => {
            const j = (Array.isArray(r.jobs) ? r.jobs[0] : r.jobs) as { job_number: string | null; name: string } | null;
            return (
              <li key={r.id as string} className="flex items-center justify-between gap-3 px-3 py-2">
                <span>
                  <span className="font-mono font-semibold">{r.order_number as string}</span>
                  <span className="text-ink-soft"> → {j ? `${j.job_number ?? ""} ${j.name}` : "—"}</span>
                </span>
                <RemoveOrderNumber id={r.id as string} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
