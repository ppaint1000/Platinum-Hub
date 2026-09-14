// Parses the raw text of a Resene "TAX INVOICE" PDF into structured
// fields. Verified against a real sample invoice (line items, PWL-T /
// TMPCHG surcharge lines, totals) — see supabase/resene_invoices_schema.sql
// for context. This is a fixed-template parser for Resene's own layout,
// not a general PDF-table parser: a parsing miss just means an admin fixes
// it at approval time, since nothing here posts to actual costs unapproved.

export type ParsedInvoiceLine = {
  itemCode: string;
  description: string;
  discount: number | null;
  quantity: number | null;
  unitPrice: number | null;
  subtotal: number;
};

export type ParsedInvoice = {
  invoiceNumber: string | null;
  customerPoNumber: string | null;
  invoiceDate: string | null; // ISO yyyy-mm-dd
  subtotal: number | null;
  gstAmount: number | null;
  total: number | null;
  lines: ParsedInvoiceLine[];
};

function toIsoDate(nzDate: string): string | null {
  const m = nzDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function toAmount(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

/** Pops trailing whitespace-separated tokens that look purely numeric
 * (digits, commas, dots, an optional trailing %) off the end of a line. */
function extractTrailingNumbers(line: string): { rest: string; numbers: string[] } {
  const tokens = line.split(/\s+/).filter(Boolean);
  const numbers: string[] = [];
  while (tokens.length && /^[\d,.]+%?$/.test(tokens[tokens.length - 1])) {
    numbers.unshift(tokens.pop()!);
  }
  return { rest: tokens.join(" "), numbers };
}

function finalizeLine(label: string, numbers: string[]): ParsedInvoiceLine | null {
  const trimmedLabel = label.trim();
  if (!trimmedLabel || numbers.length === 0) return null;

  if (numbers.length >= 4) {
    // "<lineNo> <itemCode> <description...>" + discount% qty unitPrice subtotal
    const m = trimmedLabel.match(/^\d+\s+(\S+)\s+(.*)$/);
    const [discount, quantity, unitPrice, subtotal] = numbers.slice(-4);
    return {
      itemCode: m?.[1] ?? trimmedLabel.split(/\s+/)[0],
      description: (m?.[2] ?? trimmedLabel).trim(),
      discount: toAmount(discount.replace("%", "")),
      quantity: toAmount(quantity),
      unitPrice: toAmount(unitPrice),
      subtotal: toAmount(subtotal),
    };
  }

  // "<itemCode> <description...>" + subtotal (surcharge/levy style lines)
  const m = trimmedLabel.match(/^(\S+)\s+(.*)$/);
  return {
    itemCode: m?.[1] ?? trimmedLabel,
    description: (m?.[2] ?? "").trim() || trimmedLabel,
    discount: null,
    quantity: null,
    unitPrice: null,
    subtotal: toAmount(numbers[numbers.length - 1]),
  };
}

function parseLineItems(chunk: string): ParsedInvoiceLine[] {
  const lines = chunk
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const results: ParsedInvoiceLine[] = [];
  let pendingLabel: string[] = [];

  for (const line of lines) {
    const { rest, numbers } = extractTrailingNumbers(line);
    if (rest) pendingLabel.push(rest);
    if (numbers.length > 0) {
      const parsed = finalizeLine(pendingLabel.join(" "), numbers);
      if (parsed) results.push(parsed);
      pendingLabel = [];
    }
  }

  return results;
}

export function parseReseneInvoice(text: string): ParsedInvoice {
  const invoiceNumberMatch = text.match(/Invoice Number Customer Number\s*\n(\S+)/);
  const dateAndPoMatch = text.match(
    /Invoice Date Customer PO Number\s*\n(\d{2}\/\d{2}\/\d{4})\s+(\S+)/
  );
  const subtotalMatch = text.match(/\bSubtotal\s*\$\s*([\d,]+\.\d{2})/);
  const gstMatch = text.match(/GST Amount\s*\$\s*([\d,]+\.\d{2})/);
  const totalMatch = text.match(/Total\(inc GST\)\s*\$\s*([\d,]+\.\d{2})/);

  const tableStart = text.indexOf("(exc GST)\nSubtotal\n(exc GST)");
  const tableEnd = subtotalMatch ? text.indexOf(subtotalMatch[0]) : -1;
  const chunk =
    tableStart !== -1 && tableEnd !== -1 && tableEnd > tableStart
      ? text.slice(tableStart + "(exc GST)\nSubtotal\n(exc GST)".length, tableEnd)
      : "";

  return {
    invoiceNumber: invoiceNumberMatch?.[1] ?? null,
    customerPoNumber: dateAndPoMatch?.[2] ?? null,
    invoiceDate: dateAndPoMatch ? toIsoDate(dateAndPoMatch[1]) : null,
    subtotal: subtotalMatch ? toAmount(subtotalMatch[1]) : null,
    gstAmount: gstMatch ? toAmount(gstMatch[1]) : null,
    total: totalMatch ? toAmount(totalMatch[1]) : null,
    lines: parseLineItems(chunk),
  };
}
