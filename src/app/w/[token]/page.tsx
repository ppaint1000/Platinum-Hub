// The crew's work order link: /w/<token>. No sign-in - the token is the key,
// checked by the work_order_by_token database function. Opened from the
// Hub's clock-in page for the job's site. No prices are ever sent here.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkOrderView, type Building, type Item, type Product } from "@/components/quotes/WorkOrderView";

export const metadata: Metadata = {
  title: "Work order · Platinum Painters",
  robots: { index: false, follow: false },
};

type Row = {
  quote: { location: string | null; notes: string | null };
  customer: string | null;
  buildings: Building[];
  items: Item[];
  products: Product[];
};

export default async function WorkOrderLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("work_order_by_token", { p_token: token });
  if (!data) notFound();

  const row = data as Row;
  return (
    <div className="min-h-screen bg-background px-4 py-6 print:p-0">
      <WorkOrderView
        data={{
          location: row.quote.location,
          notes: row.quote.notes,
          customerName: row.customer,
          buildings: row.buildings,
          items: row.items,
          products: row.products,
        }}
      />
    </div>
  );
}
