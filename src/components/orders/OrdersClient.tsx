"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, fmtMoney } from "@/lib/orders/format";
import { ConfirmDialog } from "@/components/orders/ConfirmDialog";

type OrderRow = {
  id: string;
  supplier: string;
  project: string;
  project_number: string | null;
  order_date: string;
  total: number;
};

export function OrdersClient({ initialOrders }: { initialOrders: OrderRow[] }) {
  const router = useRouter();
  const [confirmTarget, setConfirmTarget] = useState<OrderRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function remove() {
    if (!confirmTarget) return;
    setDeleting(true);
    setDeleteError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("orders")
      .delete()
      .eq("id", confirmTarget.id)
      .select("id");
    setDeleting(false);
    if (error) {
      setDeleteError("Couldn't delete — " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      setDeleteError(
        'Nothing was deleted — your account may not have permission to delete orders. Check that your profile\'s role is set to "admin" in Supabase.'
      );
      return;
    }
    setConfirmTarget(null);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Orders</h1>
          <p className="mt-1 text-sm text-muted">
            {initialOrders.length} order{initialOrders.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/orders/new"
          className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          New order
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {initialOrders.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            No orders yet. Create your first order to get started.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Project</th>
                <th className="px-5 py-3">Project #</th>
                <th className="px-5 py-3">Supplier</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Total</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {initialOrders.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-b-0 hover:bg-background">
                  <td className="whitespace-nowrap px-5 py-3">
                    <Link href={`/orders/${o.id}`} className="font-medium text-ink hover:underline">
                      {o.project}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs">
                    {o.project_number || "—"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">{o.supplier}</td>
                  <td className="whitespace-nowrap px-5 py-3">{fmtDate(o.order_date)}</td>
                  <td className="whitespace-nowrap px-5 py-3">{fmtMoney(o.total)}</td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/orders/${o.id}`}
                        aria-label="Edit"
                        className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => {
                          setDeleteError(null);
                          setConfirmTarget(o);
                        }}
                        aria-label="Delete"
                        className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-brand-red"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmTarget && (
        <ConfirmDialog
          title="Delete order"
          message={`Delete order for "${confirmTarget.project}" (${confirmTarget.supplier})? This can't be undone.`}
          confirming={deleting}
          confirmingLabel="Deleting…"
          error={deleteError}
          onConfirm={remove}
          onCancel={() => {
            setConfirmTarget(null);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}
