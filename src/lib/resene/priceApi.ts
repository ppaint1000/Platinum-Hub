import { createAdminClient } from "@/lib/supabase/admin";
import { rebuildPricesFromInvoices, updatePriceManually } from "@/lib/resene/priceList";

// The Resene price list (built from the Resene invoices uploaded in the
// Hub), as Costing > Resene Paint Prices shows it, and its hand edits.
// Used by that page and the old Measures integration route.

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


type Result = { status: number; body: Record<string, unknown> };

// The list is filled as invoices are uploaded; the first read after the
// table is created builds it from invoices that were already uploaded.
export async function listResenePrices(): Promise<Result> {
  const admin = createAdminClient();

  const initial = await admin.from("resene_prices").select(COLUMNS).order("description").returns<PriceRow[]>();
  let data = initial.data;
  const error = initial.error;

  if (error) {
    // 42P01 / PGRST205: the table hasn't been created yet.
    const missing = error.code === "42P01" || error.code === "PGRST205";
    return { status: missing ? 503 : 500, body: {
        error: missing
          ? "The Resene price list isn't set up yet — run supabase/resene_prices_schema.sql in the Hub's Supabase SQL Editor."
          : error.message,
        needsSetup: missing,
      } };
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

  return { status: 200, body: { prices: (data ?? []).map(toApiShape) } };
}

export type EditBody = {
  itemCode: string;
  base: string | null;
  sizeLitres: number | null;
  unitPrice: number;
};

// Corrects a product's base/size/price by hand (the invoice text doesn't
// always give a clean base, and size parsing can miss). Only updates an
// item already in the list - item_code is the table's primary key, so this
// can never create a second row for the same product.
export async function editResenePrice(body: EditBody): Promise<Result> {
  if (!body.itemCode?.trim()) {
    return { status: 400, body: { error: "itemCode is required." } };
  }
  if (!(Number(body.unitPrice) > 0)) {
    return { status: 400, body: { error: "Enter a valid price." } };
  }
  if (body.sizeLitres != null && !(Number(body.sizeLitres) > 0)) {
    return { status: 400, body: { error: "Enter a valid size, or leave it blank." } };
  }

  const admin = createAdminClient();
  try {
    await updatePriceManually(admin, body.itemCode, {
      base: body.base?.trim() || null,
      sizeLitres: body.sizeLitres != null ? Number(body.sizeLitres) : null,
      unitPrice: Number(body.unitPrice),
    });
  } catch (e) {
    return { status: 500, body: { error: e instanceof Error ? e.message : "Couldn't save." } };
  }

  const { data } = await admin
    .from("resene_prices")
    .select(COLUMNS)
    .eq("item_code", body.itemCode)
    .maybeSingle<PriceRow>();

  return { status: 200, body: { price: data ? toApiShape(data) : null } };
}
