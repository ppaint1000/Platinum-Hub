import { ResenePricesClient, type ResenePrice } from "@/components/quotes/ResenePricesClient";
import { listResenePrices } from "@/lib/resene/priceApi";
import { requireMcAccess } from "@/lib/quotes/mcAccess";

// Built from the Resene invoices uploaded in the Hub (Supplier invoices).
export default async function ResenePricesPage() {
  await requireMcAccess("admin");
  const r = await listResenePrices();
  const prices = (r.body.prices as ResenePrice[] | undefined) ?? [];
  const error = r.status === 200 ? null : String(r.body.error ?? "Couldn't load the price list.");
  return <ResenePricesClient prices={prices} error={error} />;
}
