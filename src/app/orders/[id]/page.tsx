import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrderForm } from "@/components/orders/OrderForm";

type ItemRow = {
  id: string;
  is_paint: boolean;
  description: string;
  colour: string | null;
  size: string | null;
  quantity: number;
  unit_price: number;
};
type OrderRow = {
  id: string;
  supplier: string;
  project: string;
  project_number: string | null;
  order_date: string;
  updated_at: string | null;
  order_items: ItemRow[];
};

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, supplier, project, project_number, order_date, updated_at, order_items(id, is_paint, description, colour, size, quantity, unit_price)"
    )
    .eq("id", id)
    .order("sort_order", { referencedTable: "order_items" })
    .single<OrderRow>();

  if (!order) notFound();

  return (
    <OrderForm
      existing={{
        id: order.id,
        supplier: order.supplier,
        project: order.project,
        project_number: order.project_number,
        order_date: order.order_date,
        updated_at: order.updated_at,
        items: order.order_items,
      }}
    />
  );
}
