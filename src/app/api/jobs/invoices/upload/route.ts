import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractText, getDocumentProxy } from "unpdf";
import { parseReseneInvoice } from "@/lib/resene/parseInvoice";
import { buildPriceRows, recordPrices } from "@/lib/resene/priceList";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  let file: File | null = null;
  try {
    const formData = await request.formData();
    const entry = formData.get("file");
    if (entry instanceof File) file = entry;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  let text: string;
  try {
    const pdf = await getDocumentProxy(bytes);
    ({ text } = await extractText(pdf, { mergePages: true }));
  } catch {
    return NextResponse.json({ error: "Couldn't read that PDF." }, { status: 400 });
  }

  const parsed = parseReseneInvoice(text);
  if (!parsed.invoiceNumber || parsed.lines.length === 0) {
    return NextResponse.json(
      { error: "Couldn't recognise this as a Resene invoice — check the file and try again." },
      { status: 422 }
    );
  }

  const pdfPath = `${parsed.invoiceNumber}-${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("resene-invoices")
    .upload(pdfPath, bytes, { contentType: "application/pdf" });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Auto-match to a job via a Resene order carrying this invoice's PO
  // number as its project_number.
  let jobId: string | null = null;
  if (parsed.customerPoNumber) {
    const { data: order } = await supabase
      .from("orders")
      .select("job_id")
      .eq("project_number", parsed.customerPoNumber)
      .ilike("supplier", "%resene%")
      .not("job_id", "is", null)
      .maybeSingle();
    jobId = order?.job_id ?? null;
  }

  const { data: invoice, error: invoiceError } = await supabase
    .from("resene_invoices")
    .insert({
      invoice_number: parsed.invoiceNumber,
      customer_po_number: parsed.customerPoNumber,
      invoice_date: parsed.invoiceDate,
      subtotal: parsed.subtotal,
      total: parsed.total,
      job_id: jobId,
      pdf_path: pdfPath,
    })
    .select("id")
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json(
      { error: invoiceError?.message ?? "Couldn't save the invoice." },
      { status: 500 }
    );
  }

  const { data: categoryMap } = await supabase
    .from("resene_item_category_map")
    .select("item_code, category_id");
  const categoryByCode = new Map((categoryMap ?? []).map((c) => [c.item_code, c.category_id]));

  const lineRows = parsed.lines.map((line, i) => ({
    invoice_id: invoice.id,
    line_no: i + 1,
    item_code: line.itemCode,
    description: line.description,
    discount: line.discount,
    quantity: line.quantity,
    unit_price: line.unitPrice,
    subtotal: line.subtotal,
    category_id: categoryByCode.get(line.itemCode) ?? null,
  }));

  const { error: linesError } = await supabase.from("resene_invoice_lines").insert(lineRows);
  if (linesError) {
    return NextResponse.json({ error: linesError.message }, { status: 500 });
  }

  // Keep the Resene price list current with what this invoice charged.
  // Best effort: the invoice is already saved, so a problem here (e.g. the
  // price-list table not set up yet) must not fail the upload.
  try {
    await recordPrices(
      supabase,
      buildPriceRows(lineRows, {
        invoiceNumber: parsed.invoiceNumber,
        invoiceDate: parsed.invoiceDate,
      })
    );
  } catch (e) {
    console.error("[resene-prices] couldn't update the price list", e);
  }

  return NextResponse.json({
    invoiceId: invoice.id,
    invoiceNumber: parsed.invoiceNumber,
    matchedJobId: jobId,
    lineCount: lineRows.length,
  });
}
