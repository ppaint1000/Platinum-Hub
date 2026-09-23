// Turns Resene invoice lines into the price list (resene_prices): one row
// per item code with the price most recently paid, its size in litres and
// the paint base, when the invoice text gives them. Both come from the
// description, which is Resene's abbreviated product text ("Summit Roof
// Mid Grey 10L Rivergum", "Uracryl 402 U/Deep KIT 4L Grey Friars"), so
// they're a best effort - anything not recognised is left null rather
// than guessed.
import type { SupabaseClient } from "@supabase/supabase-js";

// Surcharge / levy lines on an invoice, not products.
const NON_PRODUCT_CODES = new Set(["PWL-T", "TMPCHG", "TEMP_SURCHG"]);

export type PriceRow = {
  item_code: string;
  description: string;
  base: string | null;
  size_litres: number | null;
  unit_price: number;
  discount: number | null;
  invoice_number: string | null;
  price_date: string | null;
};

export type InvoiceLineForPricing = {
  item_code: string;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  subtotal: number | null;
  discount: number | null;
};

// "10L", "4 L", "800ml", "1Lt". The last volume in the text wins, since a
// kit reads "Hard(800ml)1L" - a hardener size then the size of the kit.
// The digit lookbehind/letter lookahead stop "100mm" or "2.5m" matching.
const SIZE_RE = /(?<![\d.])(\d+(?:\.\d+)?)\s*(ml|millilitres?|ltrs?|litres?|lt|l)(?![a-z])/gi;

export function parseSizeLitres(description: string): number | null {
  const matches = [...description.matchAll(SIZE_RE)];
  const last = matches[matches.length - 1];
  if (!last) return null;

  const value = Number(last[1]);
  if (!(value > 0)) return null;
  const litres = last[2].toLowerCase().startsWith("m") ? value / 1000 : value;
  return Math.round(litres * 1000) / 1000;
}

const BASE_RE = /\b(u\/deep|ultra[\s-]?deep|deep|mid|pastel|accent|neutral|white\s*(?:&|and)\s*light|light|base\s*\d)\b/i;

export function parseBase(description: string): string | null {
  const m = description.match(BASE_RE);
  if (!m) return null;

  const raw = m[1].toLowerCase().replace(/\s+/g, " ");
  if (raw === "u/deep" || raw.startsWith("ultra")) return "Ultra Deep";
  if (raw.startsWith("white")) return "White & Light";
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Price rows for the product lines of one invoice; one row per item code (last line wins). */
export function buildPriceRows(
  lines: InvoiceLineForPricing[],
  meta: { invoiceNumber: string | null; invoiceDate: string | null }
): PriceRow[] {
  const byCode = new Map<string, PriceRow>();

  for (const line of lines) {
    if (!line.item_code || NON_PRODUCT_CODES.has(line.item_code)) continue;

    const qty = Number(line.quantity ?? 0);
    const subtotal = Number(line.subtotal ?? 0);
    // Price actually paid per unit (discount already off); fall back to
    // the printed unit price if the line total wasn't captured.
    const paid = qty > 0 && subtotal > 0 ? subtotal / qty : Number(line.unit_price ?? 0);
    if (!(paid > 0)) continue;

    const sizeLitres = parseSizeLitres(line.description);
    byCode.set(line.item_code, {
      item_code: line.item_code,
      description: line.description,
      // Only things sold by volume are paint; don't tag a base on a brush.
      base: sizeLitres != null ? parseBase(line.description) : null,
      size_litres: sizeLitres,
      unit_price: Math.round(paid * 100) / 100,
      discount: line.discount != null ? Number(line.discount) : null,
      invoice_number: meta.invoiceNumber,
      price_date: meta.invoiceDate,
    });
  }
  return [...byCode.values()];
}

/**
 * Saves prices from a newly uploaded invoice. An older invoice uploaded
 * late doesn't overwrite a price from a newer one. A re-invoice at the
 * *same* $ as what's already stored is skipped entirely, not just
 * timestamp-bumped - otherwise a routine reorder at an unchanged price
 * would silently wipe out a base/size someone corrected by hand in
 * Measures (Costing > Resene Paint Prices) with whatever this invoice's
 * description happens to parse to.
 */
export async function recordPrices(supabase: SupabaseClient, rows: PriceRow[]) {
  if (rows.length === 0) return;

  const { data: existing, error: existingError } = await supabase
    .from("resene_prices")
    .select("item_code, unit_price, price_date")
    .in("item_code", rows.map((r) => r.item_code))
    .returns<{ item_code: string; unit_price: number; price_date: string | null }[]>();
  if (existingError) throw new Error(existingError.message);

  const current = new Map((existing ?? []).map((e) => [e.item_code, e]));
  const toWrite = rows.filter((r) => {
    const prev = current.get(r.item_code);
    if (!prev) return true;
    if (Math.abs(Number(prev.unit_price) - r.unit_price) < 0.005) return false;
    return prev.price_date == null || (r.price_date != null && r.price_date >= prev.price_date);
  });
  if (toWrite.length === 0) return;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("resene_prices")
    // A genuinely different price is real new information about what this
    // item actually costs, so it takes over from a manual edit too -
    // source resets to 'invoice' and edited_at clears.
    .upsert(
      toWrite.map((r) => ({ ...r, source: "invoice", edited_at: null, updated_at: now })),
      { onConflict: "item_code" }
    );
  if (error) throw new Error(error.message);
}

/**
 * Applies a hand-correction from Measures (Costing > Resene Paint Prices) to
 * one item - e.g. the invoice text didn't parse a base, or got the size
 * wrong. Updates the existing row in place (item_code is the primary key,
 * so there's never a second row for the same item to create); the item
 * must already be listed, since this isn't a way to add a new product.
 */
export async function updatePriceManually(
  supabase: SupabaseClient,
  itemCode: string,
  input: { base: string | null; sizeLitres: number | null; unitPrice: number }
) {
  const { data, error } = await supabase
    .from("resene_prices")
    .update({
      base: input.base,
      size_litres: input.sizeLitres,
      unit_price: input.unitPrice,
      source: "manual",
      edited_at: new Date().toISOString(),
    })
    .eq("item_code", itemCode)
    .select("item_code");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("That product isn't in the price list.");
}

/**
 * Builds the whole list from every Resene invoice already stored, oldest
 * first so the newest price wins. Invoices now cover any supplier
 * (suppliers, supplier_invoices) - this list stays Resene-only, so it's
 * scoped to Resene's supplier id rather than every invoice line in the
 * table.
 */
export async function rebuildPricesFromInvoices(supabase: SupabaseClient) {
  const { data: resene } = await supabase
    .from("suppliers")
    .select("id")
    .ilike("name", "Resene")
    .maybeSingle<{ id: string }>();
  if (!resene) return 0;

  const { data, error } = await supabase
    .from("supplier_invoice_lines")
    .select(
      "item_code, description, quantity, unit_price, subtotal, discount, invoice:supplier_invoices!inner(invoice_number, invoice_date, supplier_id)"
    )
    .eq("invoice.supplier_id", resene.id)
    .returns<
      (InvoiceLineForPricing & {
        invoice: { invoice_number: string | null; invoice_date: string | null } | null;
      })[]
    >();
  if (error) throw new Error(error.message);

  const sorted = [...(data ?? [])].sort((a, b) =>
    (a.invoice?.invoice_date ?? "").localeCompare(b.invoice?.invoice_date ?? "")
  );

  const byCode = new Map<string, PriceRow>();
  for (const line of sorted) {
    const [row] = buildPriceRows([line], {
      invoiceNumber: line.invoice?.invoice_number ?? null,
      invoiceDate: line.invoice?.invoice_date ?? null,
    });
    if (row) byCode.set(row.item_code, row);
  }
  if (byCode.size === 0) return 0;

  const now = new Date().toISOString();
  const { error: upsertError } = await supabase
    .from("resene_prices")
    .upsert([...byCode.values()].map((r) => ({ ...r, updated_at: now })), { onConflict: "item_code" });
  if (upsertError) throw new Error(upsertError.message);
  return byCode.size;
}
