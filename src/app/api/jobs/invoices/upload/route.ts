import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractText, getDocumentProxy } from "unpdf";
import { parseReseneInvoice, type ParsedInvoice } from "@/lib/resene/parseInvoice";
import { parseAaltoInvoice } from "@/lib/aalto/parseInvoice";
import { parseSuperlooInvoices } from "@/lib/superloo/parseInvoice";
import { buildPriceRows, recordPrices } from "@/lib/resene/priceList";
import { findOrCreateSupplierId } from "@/lib/jobs/findOrCreateSupplier";

// Every supplier with a working PDF parser, keyed by name (case-
// insensitive lookup below). Each returns an array - Resene and Aalto
// invoices are always one-per-PDF so it's an array of one, but Superloo
// mails one PDF covering every site's invoice for the billing run, so
// theirs can come back as several. Any supplier not listed here has no
// parser yet (no sample invoice to build one from) - InvoiceUploadForm
// only shows the file picker for these three, everything else goes
// through the manual-entry form instead (createManualInvoiceAction).
const PARSERS: Record<string, (text: string) => ParsedInvoice[]> = {
  resene: (text) => [parseReseneInvoice(text)],
  aalto: (text) => [parseAaltoInvoice(text)],
  superloo: (text) => parseSuperlooInvoices(text),
};

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
  let supplierName = "";
  try {
    const formData = await request.formData();
    const entry = formData.get("file");
    if (entry instanceof File) file = entry;
    const supplierEntry = formData.get("supplier");
    if (typeof supplierEntry === "string") supplierName = supplierEntry.trim();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const parseFn = PARSERS[supplierName.toLowerCase()];
  if (!parseFn) {
    return NextResponse.json(
      { error: `No PDF reader for ${supplierName || "that supplier"} yet — enter it by hand instead.` },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  let text: string;
  try {
    const pdf = await getDocumentProxy(bytes);
    ({ text } = await extractText(pdf, { mergePages: true }));
  } catch {
    return NextResponse.json({ error: "Couldn't read that PDF." }, { status: 400 });
  }

  const parsedInvoices = parseFn(text).filter((p) => p.invoiceNumber && p.lines.length > 0);
  if (parsedInvoices.length === 0) {
    return NextResponse.json(
      { error: `Couldn't recognise this as a ${supplierName} invoice — check the file and try again.` },
      { status: 422 }
    );
  }

  const supplier = await findOrCreateSupplierId(supabase, supplierName);
  if ("error" in supplier) {
    return NextResponse.json({ error: supplier.error }, { status: 500 });
  }

  // Checked before touching storage, so a repeat upload doesn't leave an
  // orphaned PDF behind. Scoped to this supplier - two different suppliers
  // each numbering their own invoices "1001" isn't a duplicate.
  const { data: existingRows } = await supabase
    .from("supplier_invoices")
    .select("invoice_number")
    .eq("supplier_id", supplier.id)
    .in(
      "invoice_number",
      parsedInvoices.map((p) => p.invoiceNumber as string)
    );
  const alreadyUploaded = new Set((existingRows ?? []).map((r) => r.invoice_number));
  const toImport = parsedInvoices.filter((p) => !alreadyUploaded.has(p.invoiceNumber));

  if (toImport.length === 0) {
    const numbers = parsedInvoices.map((p) => p.invoiceNumber).join(", ");
    return NextResponse.json(
      {
        error:
          parsedInvoices.length === 1
            ? `Invoice ${numbers} has already been uploaded.`
            : `All ${parsedInvoices.length} invoices in this file (${numbers}) have already been uploaded.`,
      },
      { status: 409 }
    );
  }

  // One physical file can cover several invoices (Superloo) - it's stored
  // once and every resulting row points at the same path.
  const pdfPath = `${supplierName}-${toImport[0].invoiceNumber}-${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("resene-invoices")
    .upload(pdfPath, bytes, { contentType: "application/pdf" });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: categoryMap } = await supabase
    .from("resene_item_category_map")
    .select("item_code, category_id");
  const categoryByCode = new Map((categoryMap ?? []).map((c) => [c.item_code, c.category_id]));
  const isResene = supplierName.toLowerCase() === "resene";

  const created: { invoiceNumber: string; matchedJobId: string | null; lineCount: number }[] = [];
  const failed: string[] = [];

  for (const parsed of toImport) {
    // Auto-match to a job via an order (any supplier) carrying this
    // invoice's PO number as its project_number.
    let jobId: string | null = null;
    if (parsed.customerPoNumber) {
      const { data: order } = await supabase
        .from("orders")
        .select("job_id")
        .eq("project_number", parsed.customerPoNumber)
        .ilike("supplier", `%${supplierName}%`)
        .not("job_id", "is", null)
        .maybeSingle();
      jobId = order?.job_id ?? null;
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from("supplier_invoices")
      .insert({
        supplier_id: supplier.id,
        source: "parsed",
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
      failed.push(parsed.invoiceNumber as string);
      continue;
    }

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
      // Kept in sync with the invoice's own job_id by
      // assignInvoiceJobAction / moveInvoiceToJobAction - this is what a
      // job's pending-approvals list actually filters on, so a split
      // invoice (splitInvoiceLinesAction) can point individual lines at
      // different jobs later.
      job_id: jobId,
    }));

    const { error: linesError } = await supabase.from("supplier_invoice_lines").insert(lineRows);
    if (linesError) {
      await supabase.from("supplier_invoices").delete().eq("id", invoice.id);
      failed.push(parsed.invoiceNumber as string);
      continue;
    }

    // Keep the Resene price list current with what this invoice charged -
    // Resene only, per how Measures' Resene Paint Prices is scoped. Best
    // effort: the invoice is already saved, so a problem here must not
    // fail the upload.
    if (isResene) {
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
    }

    created.push({
      invoiceNumber: parsed.invoiceNumber as string,
      matchedJobId: jobId,
      lineCount: lineRows.length,
    });
  }

  if (created.length === 0) {
    await supabase.storage.from("resene-invoices").remove([pdfPath]);
    return NextResponse.json({ error: "Couldn't save the invoice." }, { status: 500 });
  }

  return NextResponse.json({
    invoices: created,
    skippedDuplicates: parsedInvoices.length - toImport.length,
    failed,
  });
}
