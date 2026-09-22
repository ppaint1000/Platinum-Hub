import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQuotesWebhook } from "@/lib/integrations/quotesWebhook";
import { rebuildPricesFromInvoices, updatePriceManually } from "@/lib/resene/priceList";

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
  source: string;
  edited_at: string | null;
};

const COLUMNS =
  "item_code, description, base, size_litres, unit_price, price_per_litre, discount, invoice_number, price_date, source, edited_at";

function toApiShape(p: PriceRow) {
  return {
    itemCode: p.item_code,
    description: p.description,
    base: p.base,
    sizeLitres: p.size_litres != null ? Number(p.size_litres) : null,
    unitPrice: Number(p.unit_price),
    pricePerLitre: p.price_per_litre != null ? Number(p.price_per_litre) : null,
    discount: p.discount != null ? Number(p.discount) : null,
    invoiceNumber: p.invoice_number,
    priceDate: p.price_date,
    editedManually: p.source === "manual",
    editedAt: p.edited_at,
  };
}

// Lets Measures read the Resene price list (Costing > Resene Paint Prices),
// same shared-secret header as the other /api/integrations/quotes routes.
// The list is filled as invoices are uploaded; the first read after the
// table is created builds it from invoices that were already uploaded.
export async function GET(request: NextRequest) {
  const authError = verifyQuotesWebhook(request);
  if (authError) return authError;

  const admin = createAdminClient();

  const initial = await admin.from("resene_prices").select(COLUMNS).order("description").returns<PriceRow[]>();
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
        ({ data } = await admin.from("resene_prices").select(COLUMNS).order("description").returns<PriceRow[]>());
      }
    } catch (e) {
      console.error("[resene-prices] initial build failed", e);
    }
  }

  return NextResponse.json({ prices: (data ?? []).map(toApiShape) });
}

type EditBody = {
  itemCode: string;
  base: string | null;
  sizeLitres: number | null;
  unitPrice: number;
};

// Lets Measures correct a product's base/size/price by hand (the invoice
// text doesn't always give a clean base, and size parsing can miss). Only
// updates an item already in the list - item_code is the table's primary
// key, so this can never create a second row for the same product.
export async function POST(request: NextRequest) {
  const authError = verifyQuotesWebhook(request);
  if (authError) return authError;

  let body: EditBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.itemCode?.trim()) {
    return NextResponse.json({ error: "itemCode is required." }, { status: 400 });
  }
  if (!(Number(body.unitPrice) > 0)) {
    return NextResponse.json({ error: "Enter a valid price." }, { status: 400 });
  }
  if (body.sizeLitres != null && !(Number(body.sizeLitres) > 0)) {
    return NextResponse.json({ error: "Enter a valid size, or leave it blank." }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    await updatePriceManually(admin, body.itemCode, {
      base: body.base?.trim() || null,
      sizeLitres: body.sizeLitres != null ? Number(body.sizeLitres) : null,
      unitPrice: Number(body.unitPrice),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save." }, { status: 500 });
  }

  const { data } = await admin
    .from("resene_prices")
    .select(COLUMNS)
    .eq("item_code", body.itemCode)
    .maybeSingle<PriceRow>();

  return NextResponse.json({ price: data ? toApiShape(data) : null });
}
