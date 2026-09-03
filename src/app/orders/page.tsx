import { createClient } from "@/lib/supabase/server";
import { OrdersClient } from "@/components/orders/OrdersClient";

type OrderRow = {
  id: string;
  supplier: string;
  project: string;
  project_number: string | null;
  order_date: string;
  order_items: { line_total: number }[];
};

export default async function OrdersPage() {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, supplier, project, project_number, order_date, order_items(line_total)"
    )
    .order("order_date", { ascending: false })
    .returns<OrderRow[]>();

  const rows = (orders ?? []).map((o) => ({
    id: o.id,
    supplier: o.supplier,
    project: o.project,
    project_number: o.project_number,
    order_date: o.order_date,
    total: o.order_items.reduce((s, i) => s + Number(i.line_total), 0),
  }));

  return <OrdersClient initialOrders={rows} />;
}
