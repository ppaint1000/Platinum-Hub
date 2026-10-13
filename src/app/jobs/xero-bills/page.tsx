// Xero bills - supplier bills that couldn't be matched to a job (pick the
// job, or mark them overheads), and each supplier's cost category or "leave
// out". Matched bills go straight onto job costs. Admins only.
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Panel } from "@/components/ui";
import { CheckXeroButton } from "@/components/jobs/CheckXeroButton";
import { BillRow, SupplierRow } from "./rows";
import { money } from "@/lib/jobs/jobFinance";

export default async function XeroBillsPage() {
  await requireAdmin();
  const db = createAdminClient();
  const [{ data: bills }, { data: suppliers }, { data: cats }, { data: jobs }] = await Promise.all([
    db.from("xero_unmatched_bills").select("*").is("job_id", null).eq("overhead", false).order("bill_date", { ascending: false }),
    db.from("xero_supplier_settings").select("contact_name, category_id, excluded").order("contact_name"),
    db.from("job_categories").select("id, label").order("sort_order"),
    db
      .from("jobs")
      .select("id, job_number, name, client:clients(name)")
      .in("status", ["won", "scheduled", "in_progress", "complete", "invoiced", "paid"])
      .order("job_number", { ascending: false })
      .returns<{ id: string; job_number: string | null; name: string; client: { name: string } | null }[]>(),
  ]);
  const jobOptions = (jobs ?? []).map((j) => ({ id: j.id, label: `${j.job_number ?? ""} ${j.name}${j.client?.name ? ` (${j.client.name})` : ""}`.trim() }));
  const categories = (cats ?? []).map((c) => ({ id: c.id as string, label: c.label as string }));
  const needCategory = (suppliers ?? []).filter((s) => !s.category_id && !s.excluded).length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 sm:p-8">
      <div>
        <Link href="/jobs/live" className="text-sm font-medium text-ink-soft hover:text-ink">
          ← Live jobs
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-ink">Xero bills</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Supplier bills approved in Xero go onto the job they&apos;re for, matched by the job number or an order number logged against the job (
          <Link href="/jobs/order-numbers" className="font-semibold text-accent hover:underline">
            Log an order
          </Link>
          ). Bills from {new Date("2026-10-13").toLocaleDateString("en-NZ")} on.
        </p>
        <div className="mt-3">
          <CheckXeroButton />
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-ink">Bills that need a job ({(bills ?? []).length})</h2>
        {(bills ?? []).length === 0 ? (
          <Panel className="p-5 text-sm text-ink-soft">Nothing waiting - every bill is on a job (or marked overheads).</Panel>
        ) : (
          <Panel className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                  <th className="px-3 py-2 font-semibold">Supplier</th>
                  <th className="px-3 py-2 font-semibold">Bill / reference</th>
                  <th className="px-3 py-2 text-right font-semibold">Excl GST</th>
                  <th className="px-3 py-2 font-semibold">Job</th>
                </tr>
              </thead>
              <tbody>
                {(bills ?? []).map((b) => (
                  <BillRow
                    key={b.xero_bill_id as string}
                    bill={{
                      id: b.xero_bill_id as string,
                      supplier: (b.contact_name as string) ?? "—",
                      number: (b.bill_number as string) ?? "",
                      reference: (b.reference as string) ?? "",
                      date: b.bill_date as string,
                      amount: money(Number(b.subtotal ?? 0), true),
                    }}
                    jobOptions={jobOptions}
                  />
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold text-ink">Suppliers</h2>
        <p className="mb-3 text-sm text-ink-soft">
          The cost category each supplier&apos;s bills go under on a job{needCategory ? ` - ${needCategory} still need one (they go under Other until set)` : ""}.
          &quot;Leave out&quot; keeps a supplier&apos;s bills off jobs altogether - e.g. Amir Collins Painting Services, whose hours already cost from timesheets.
        </p>
        {(suppliers ?? []).length === 0 ? (
          <Panel className="p-5 text-sm text-ink-soft">Suppliers appear here as their bills come in from Xero.</Panel>
        ) : (
          <Panel className="divide-y divide-line">
            {(suppliers ?? []).map((s) => (
              <SupplierRow
                key={s.contact_name as string}
                name={s.contact_name as string}
                categoryId={(s.category_id as string | null) ?? ""}
                excluded={!!s.excluded}
                categories={categories}
              />
            ))}
          </Panel>
        )}
      </section>
    </div>
  );
}
