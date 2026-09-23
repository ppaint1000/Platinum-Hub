// Parses the raw text of a Superloo "TAX INVOICE" PDF into structured
// fields. Verified against a real sample - a site toilet service charge
// line plus a fuel levy line, one whose code/description wraps across
// several raw text lines. Same fixed-template convention as the
// Resene/Aalto parsers - a parsing miss just means the admin enters that
// invoice by hand instead.
//
// Superloo mails one PDF per billing run covering every site being
// serviced, so a single upload can contain several genuinely separate
// invoices (different invoice numbers, different totals) - each page
// starts with "SuperLoo Sanitation Ltd", which is used to split the PDF
// back into one invoice's worth of text per page before parsing each
// individually. A single-invoice PDF just yields an array of one.
import type { ParsedInvoice, ParsedInvoiceLine } from "@/lib/resene/parseInvoice";

export type { ParsedInvoice, ParsedInvoiceLine };

function toAmount(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

// "31-Jul-2026" -> "2026-07-31".
function toIsoDate(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

// The value appears before its own label throughout this layout - e.g.
// invoice number/date print as "466793" then later "C14962 31-Jul-2026
// CUSTOMER NO: INVOICE DATE:", the customer number and date *before* the
// labels naming them.
const INVOICE_NUMBER_RE = /TAX INVOICE\s*\n(\d+)/;
const DATE_RE = /\S+\s+(\d{1,2}-[A-Za-z]{3}-\d{4})CUSTOMER NO: INVOICE DATE:/;
const TOTALS_RE =
  /\$([\d,]+\.\d{2})GST DETAILS: SUB TOTAL:\s*\n\$([\d,]+\.\d{2})GST:\s*\n\$([\d,]+\.\d{2})INVOICE TOTAL:/;

// Recognised NZ GST rate codes - splits the fused "<gstCode><per>" tail
// (e.g. "STDWK") where nothing else marks the boundary between them. Not
// used for anything but line-splitting; the actual code isn't stored.
const GST_CODE_RE = /^(STD|ZERO|EXEMPT)/;

// One line item, once its raw text lines (which can wrap mid-item - see
// joinWrapped) are joined into a single string:
//   <qty> <code> <fromDate> <toDate><description> $<value><rate> <gstCode><per>
// the second date runs straight into the description with no space; the
// two numbers at the end are fused the same way Aalto's are.
const LINE_RE =
  /^(\d+(?:\.\d+)?)\s+(.+?)\s*\d{1,2}-[A-Za-z]{3}-\d{4}\s+\d{1,2}-[A-Za-z]{3}-\d{4}(.+?)\s*\$([\d,]+\.\d{2})(\d+(?:\.\d+)?)\s*[A-Z]+$/;

// Rejoins a line item's raw text lines. A line ending in "-" was split
// mid-word by the PDF's column width (e.g. a code like "FUEL-LEVY-WK"
// wrapping right at its own hyphen) and rejoins with nothing in between;
// anything else was a normal wrap and needs a space put back.
function joinWrapped(lines: string[]): string {
  return lines.reduce((acc, line) => (!acc ? line : acc.endsWith("-") ? acc + line : `${acc} ${line}`), "");
}

function parseLineItems(pageText: string): ParsedInvoiceLine[] {
  const tableStart = pageText.indexOf("Billing period from");
  const tableEnd = pageText.indexOf("We are pleased to advise");
  if (tableStart === -1 || tableEnd === -1 || tableEnd <= tableStart) return [];

  const rawLines = pageText
    .slice(tableStart, tableEnd)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Group raw lines into one bucket per item - a new item starts at a line
  // beginning with a decimal quantity ("1.0 ..."); everything up to (not
  // including) the next such line, or the end of the table, belongs to it.
  const itemLineGroups: string[][] = [];
  for (const line of rawLines) {
    if (/^\d+(?:\.\d+)?\s/.test(line)) {
      itemLineGroups.push([line]);
    } else if (itemLineGroups.length > 0) {
      itemLineGroups[itemLineGroups.length - 1].push(line);
    }
  }

  const results: ParsedInvoiceLine[] = [];
  for (const group of itemLineGroups) {
    const joined = joinWrapped(group);
    const m = joined.match(LINE_RE);
    if (!m) continue;
    const [, qty, codeRaw, descriptionRaw, value, rate] = m;
    const description = descriptionRaw.replace(GST_CODE_RE, "").trim() || descriptionRaw.trim();
    results.push({
      itemCode: codeRaw.trim(),
      description,
      discount: null,
      quantity: toAmount(qty),
      unitPrice: toAmount(rate),
      subtotal: toAmount(value),
    });
  }
  return results;
}

function parseOnePage(pageText: string): ParsedInvoice {
  const numberMatch = pageText.match(INVOICE_NUMBER_RE);
  const dateMatch = pageText.match(DATE_RE);
  const totalsMatch = pageText.match(TOTALS_RE);

  return {
    invoiceNumber: numberMatch?.[1] ?? null,
    // Superloo bills by site/contract, not a customer PO - nothing here
    // maps to Resene-style PO-matching.
    customerPoNumber: null,
    invoiceDate: dateMatch ? toIsoDate(dateMatch[1]) : null,
    subtotal: totalsMatch ? toAmount(totalsMatch[1]) : null,
    gstAmount: totalsMatch ? toAmount(totalsMatch[2]) : null,
    total: totalsMatch ? toAmount(totalsMatch[3]) : null,
    lines: parseLineItems(pageText),
  };
}

/**
 * One Superloo PDF often covers several sites' invoices in one mailing -
 * each page is its own complete, independent invoice (own number, own
 * total). Splits on each page's fixed opening line and parses every page,
 * so a single upload can produce several Supplier Invoice records. A
 * single-invoice PDF just returns an array of one.
 */
export function parseSuperlooInvoices(text: string): ParsedInvoice[] {
  const pages = text.split(/(?=SuperLoo Sanitation Ltd\n)/).filter((p) => p.trim());
  return pages.map(parseOnePage).filter((inv) => inv.invoiceNumber && inv.lines.length > 0);
}
