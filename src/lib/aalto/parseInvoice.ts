// Parses the raw text of an Aalto "TAX INVOICE" PDF into structured fields.
// Verified against a real sample invoice - see the sibling Superloo/Resene
// parsers for the same convention. A fixed-template parser for Aalto's own
// layout, not a general PDF-table parser: a parsing miss just means the
// admin enters that invoice by hand instead (the manual-entry path every
// supplier without a working parser already uses).
import type { ParsedInvoice, ParsedInvoiceLine } from "@/lib/resene/parseInvoice";

export type { ParsedInvoice, ParsedInvoiceLine };

function toIsoDate(nzDate: string): string | null {
  const m = nzDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function toAmount(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

// unpdf's text extraction interleaves label/value columns in the order
// they're drawn in the PDF, not visual reading order - e.g. the invoice
// number's own value line reads "8915 556541" (order no, then invoice
// number) a couple of lines *after* the "...Invoice Number:" header.
const INVOICE_NUMBER_RE = /Invoice Number:\s*\n\s*(\S+)\s+(\S+)/;
const DATE_RE = /(\d{2}\/\d{2}\/\d{4})\s+Page \d+ of \d+/;
// "<description><itemCode(5+ digits)> <qty> $<lineTotal>$<unitPrice>" - the
// two $ amounts are fused with no space, and printed total-then-unit-price
// (the reverse of their visual column order).
const LINE_RE = /^(.+?)(\d{5,})\s+(\d+(?:\.\d+)?)\s+\$([\d,]+\.\d{2})\$([\d,]+\.\d{2})\s*$/gm;
const SUBTOTAL_RE = /Total Net\s*\$\s*([\d,]+\.\d{2})/;

function parseLineItems(text: string): ParsedInvoiceLine[] {
  const lines: ParsedInvoiceLine[] = [];
  for (const m of text.matchAll(LINE_RE)) {
    const [, description, itemCode, qty, lineTotal, unitPrice] = m;
    lines.push({
      itemCode,
      description: description.trim(),
      discount: null,
      quantity: toAmount(qty),
      unitPrice: toAmount(unitPrice),
      subtotal: toAmount(lineTotal),
    });
  }
  return lines;
}

export function parseAaltoInvoice(text: string): ParsedInvoice {
  const numberMatch = text.match(INVOICE_NUMBER_RE);
  const dateMatch = text.match(DATE_RE);
  const subtotalMatch = text.match(SUBTOTAL_RE);

  // GST is always 15% standard-rated on every sample seen - derived rather
  // than parsed off the page, since the total/GST figures print in a
  // jumbled order that isn't reliably tied to their own labels.
  const subtotal = subtotalMatch ? toAmount(subtotalMatch[1]) : null;
  const gstAmount = subtotal != null ? Math.round(subtotal * 0.15 * 100) / 100 : null;
  const total = subtotal != null && gstAmount != null ? Math.round((subtotal + gstAmount) * 100) / 100 : null;

  return {
    // Group 1 is Aalto's own order number, not a customer PO in the sense
    // Resene's PO-matching expects, but it's the closest equivalent and
    // costs nothing to carry through.
    invoiceNumber: numberMatch?.[2] ?? null,
    customerPoNumber: numberMatch?.[1] ?? null,
    invoiceDate: dateMatch ? toIsoDate(dateMatch[1]) : null,
    subtotal,
    gstAmount,
    total,
    lines: parseLineItems(text),
  };
}
