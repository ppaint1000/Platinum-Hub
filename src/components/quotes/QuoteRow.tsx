"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fmtCurrency, fmtDate } from "@/lib/quotes/format";
import { QuoteStatusChip } from "@/components/quotes/StatusChip";
import { forgetCosting } from "@/lib/quotes/lastCosting";
import { OwnerSelect } from "@/components/quotes/OwnerSelect";
import type { McOwner } from "@/lib/quotes/mcAccess";

type Quote = {
  id: string;
  status: string;
  valid_until: string | null;
  total: number;
  created_at: string;
  location: string | null;
  customerName: string;
  ownerId: string | null;
};

const DELETABLE_STATUSES = ["draft", "draft_review"];

export function QuoteRow({ quote, owners }: { quote: Quote; owners: McOwner[] | null }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this costing? This can't be undone.")) return;

    setDeleting(true);
    const supabase = createClient();
    try {
      const { data: buildings } = await supabase
        .from("quote_buildings")
        .select("id")
        .eq("quote_id", quote.id);
      const buildingIds = (buildings ?? []).map((b) => b.id);

      if (buildingIds.length) {
        await supabase.from("quote_building_lines").delete().in("building_id", buildingIds);
      }
      await supabase.from("quote_buildings").delete().eq("quote_id", quote.id);
      await supabase.from("quote_line_items").delete().eq("quote_id", quote.id);
      await supabase.from("quotes").delete().eq("id", quote.id);
      forgetCosting(quote.id);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <tr
      onClick={() => router.push(`/costing/${quote.id}`)}
      className="cursor-pointer border-b border-border last:border-b-0 hover:bg-background"
    >
      <td className="whitespace-nowrap px-5 py-3 font-medium text-ink">{quote.customerName}</td>
      <td className="hidden whitespace-nowrap px-5 py-3 text-muted sm:table-cell">
        {quote.location ?? "—"}
      </td>
      {owners && (
        <td className="whitespace-nowrap px-5 py-3">
          <OwnerSelect table="quotes" id={quote.id} ownerId={quote.ownerId} owners={owners} />
        </td>
      )}
      <td className="whitespace-nowrap px-5 py-3">
        <QuoteStatusChip status={quote.status} />
      </td>
      <td className="hidden whitespace-nowrap px-5 py-3 text-muted sm:table-cell">
        {fmtDate(quote.valid_until)}
      </td>
      <td className="whitespace-nowrap px-5 py-3 font-medium">{fmtCurrency(quote.total)}</td>
      <td className="hidden whitespace-nowrap px-5 py-3 text-muted md:table-cell">
        {fmtDate(quote.created_at)}
      </td>
      <td className="whitespace-nowrap px-5 py-3">
        {DELETABLE_STATUSES.includes(quote.status) && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Delete costing"
            className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-brand-red disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  );
}
