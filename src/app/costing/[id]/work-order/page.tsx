// Work order — the crew's copy of a costing (see WorkOrderView). The app's
// header and tabs are hidden when printing.
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkOrderView, type Building, type Item, type Product } from "@/components/quotes/WorkOrderView";

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: quote }, { data: buildingRows }, { data: itemRows }, { data: productRows }] = await Promise.all([
    supabase.from("quotes").select("*, customers:clients(name)").eq("id", id).single(),
    supabase.from("quote_buildings").select("*, quote_building_lines(*)").eq("quote_id", id).order("sort_order"),
    supabase
      .from("quote_line_items")
      .select("id, building_id, description, quantity, is_access, is_option")
      .eq("quote_id", id)
      .order("sort_order"),
    supabase.from("paint_products").select("id, name, brand, is_default"),
  ]);
  if (!quote) notFound();

  return (
    <WorkOrderView
      data={{
        location: quote.location,
        notes: quote.notes,
        customerName: (quote.customers as unknown as { name: string } | null)?.name ?? null,
        buildings: (buildingRows ?? []) as Building[],
        items: (itemRows ?? []) as Item[],
        products: (productRows ?? []) as Product[],
      }}
    />
  );
}
