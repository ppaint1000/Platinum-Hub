import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQuotesWebhook } from "@/lib/integrations/quotesWebhook";
import { rebuildPricesFromInvoices } from "@/lib/resene/priceList";

type PriceRow = {
  item_code: string;
  description: string;
  base: string | null;
  size_litres: number | null;
  unit_price: number;
  price_per_litre: number | null;
  discount: number | null;
  invoice_number: string | null;
  price_date: string | null;
};

// Lets Measures read the Resene price list (Costing > Resene Paint Prices),
// same shared-secret header as the other /api/integrations/quotes routes.
// The list is filled as invoices are uploaded; the first read after the
// table is created builds it from invoices that were already uploaded.
export async function GET(request: NextRequest) {
  const authError = verifyQuotesWebhook(request);
  if (authError) return authError;

  const admin = createAdminClient();
  const columns =
    "item_code, description, base, size_litres, unit_price, price_per_litre, discount, invoice_number, price_date";

  const initial = await admin
    .from("resene_prices")
    .select(columns)
    .order("description")
    .returns<PriceRow[]>();
  let data = initial.data;
  const error = initial.error;

  if (error) {
    // 42P01 / PGRST205: the table hasn't been created yet.
    const missing = error.code === "42P01" || error.code === "PGRST205";
    return NextResponse.json(
      {
        error: missing
          ? "The Resene price list isn't set up yet — run supabase/resene_prices_schema.sql in the Hub's Supabase SQL Editor."
          : error.message,
        needsSetup: missing,
      },
      { status: missing ? 503 : 500 }
    );
  }

  if ((data ?? []).length === 0) {
    try {
      const built = await rebuildPricesFromInvoices(admin);
      if (built > 0) {
        ({ data } = await admin
          .from("resene_prices")
          .select(columns)
          .order("description")
          .returns<PriceRow[]>());
      }
    } catch (e) {
      console.error("[resene-prices] initial build failed", e);
    }
  }

  return NextResponse.json({
    prices: (data ?? []).map((p) => ({
      itemCode: p.item_code,
      description: p.description,
      base: p.base,
      sizeLitres: p.size_litres != null ? Number(p.size_litres) : null,
      unitPrice: Number(p.unit_price),
      pricePerLitre: p.price_per_litre != null ? Number(p.price_per_litre) : null,
      discount: p.discount != null ? Number(p.discount) : null,
      invoiceNumber: p.invoice_number,
      priceDate: p.price_date,
    })),
  });
}
