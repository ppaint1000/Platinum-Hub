// Reads date / odometer / litres / total cost off a fuel receipt photo, free and
// entirely on the driver's phone: tesseract.js (open-source OCR) runs in
// the browser, fetching its engine + English data from the jsDelivr CDN on
// first use (~10 MB, then cached by the browser). Nothing is sent to any
// paid or third-party reading service.
//
// OCR on a crumpled thermal receipt is imperfect, so this only ever
// pre-fills the form - the driver checks the numbers before saving.

export type ReceiptReading = {
  // YYYY-MM-DD, the same shape as an <input type="date"> value.
  date: string | null;
  odometerKm: number | null;
  litres: number | null;
  cost: number | null;
};

// Phone photos are 12MP+; OCR on that is slow and no more accurate.
// Downscale and greyscale first.
const MAX_SIDE = 1800;

async function prepareImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.filter = "grayscale(1) contrast(1.4)";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

export async function readReceipt(file: File): Promise<ReceiptReading> {
  // Loaded on demand so the ~10 MB engine is only fetched when someone
  // actually photographs a receipt, never on page load.
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const image = await prepareImage(file);
    const { data } = await worker.recognize(image);
    return parseReceiptText(data.text);
  } finally {
    await worker.terminate();
  }
}

function toNumber(raw: string): number | null {
  const n = Number(raw.replace(/,/g, "."));
  return Number.isFinite(n) ? n : null;
}

// Money-looking values on a line: 2 decimal places, optional $.
function moneyValues(line: string): number[] {
  return [...line.matchAll(/\$?\s?(\d{1,4}[.,]\d{2})(?!\d)/g)]
    .map((m) => toNumber(m[1]))
    .filter((n): n is number => n !== null);
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

// Receipt dates in the forms NZ fuel receipts print them: 26/09/2026,
// 26-09-26, 26.09.2026 (day first), 2026-09-26, or 26 SEP 2026.
const DATE_PATTERNS: { re: RegExp; ymd: (m: RegExpMatchArray) => [number, number, number] }[] = [
  { re: /\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/, ymd: (m) => [+m[1], +m[2], +m[3]] },
  { re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/, ymd: (m) => [+m[3], +m[2], +m[1]] },
  {
    re: new RegExp(`\\b(\\d{1,2})[\\s-]?(${MONTHS.join("|")})[A-Z]*[\\s-]?(\\d{4}|\\d{2})\\b`),
    ymd: (m) => [+m[3], MONTHS.indexOf(m[2]) + 1, +m[1]],
  },
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Only accept a real calendar date from roughly the last year - anything
// else is far more likely a misread than a genuinely old receipt.
function validDate(year: number, month: number, day: number): string | null {
  if (year < 100) year += 2000;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  if (d > tomorrow || d < yearAgo) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function parseReceiptText(text: string): ReceiptReading {
  const rawLines = text
    .toUpperCase()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // ── Date: first valid one on the receipt ──
  let date: string | null = null;
  for (const line of rawLines) {
    for (const { re, ymd } of DATE_PATTERNS) {
      const m = line.match(re);
      if (m) date = validDate(...ymd(m));
      if (date) break;
    }
    if (date) break;
  }

  // Blank out date- and time-looking text before reading numbers, so
  // "26.09.2026" or "14:05" is never mistaken for a litres or $ value.
  const lines = rawLines.map((line) => {
    let cleaned = line.replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, " ");
    for (const { re } of DATE_PATTERNS) cleaned = cleaned.replace(new RegExp(re.source, "g"), " ");
    return cleaned;
  });

  // ── Odometer: "ODOMETER 45410", "ODO: 45,410", "KMS 45410", "MILEAGE" ──
  let odometerKm: number | null = null;
  for (const line of lines) {
    if (!/\b(ODO(METER)?|ODO\.?|KMS?|MILEAGE|KM READING)\b/.test(line)) continue;
    const m = line.replace(/(\d)[,\s](?=\d{3}\b)/g, "$1").match(/\b(\d{3,7})\b/);
    if (m) {
      odometerKm = Number(m[1]);
      break;
    }
  }

  // ── Litres: "45.23 L", "45.23LTR", "LITRES 45.23", "VOLUME: 45.23" ──
  let litres: number | null = null;
  for (const line of lines) {
    const after = line.match(/(\d{1,3}[.,]\d{1,3})\s?(L|LT|LTR|LTRS|LITRES?|LITERS?)\b/);
    const before = line.match(/\b(LITRES?|LITERS?|LTRS?|VOLUME|QTY)\b[^\d]{0,6}(\d{1,3}[.,]\d{1,3})/);
    const value = after ? toNumber(after[1]) : before ? toNumber(before[2]) : null;
    if (value !== null && value > 0 && value <= 400) {
      litres = value;
      break;
    }
  }

  // ── Cost: the TOTAL line (not SUBTOTAL), else the largest $ amount ──
  let cost: number | null = null;
  for (const line of lines) {
    if (!/\b(TOTAL|AMOUNT DUE|AMOUNT|EFTPOS|PURCHASE)\b/.test(line)) continue;
    // "SUBTOTAL", "GST TOTAL", "TOTAL LITRES 45.23" aren't the amount paid.
    if (/SUB\s?TOTAL|GST|LITRE|LITER|LTR|VOLUME/.test(line)) continue;
    const values = moneyValues(line);
    if (values.length > 0) {
      cost = values[values.length - 1];
      break;
    }
  }
  if (cost === null) {
    const all = lines.flatMap(moneyValues).filter((n) => n !== litres);
    if (all.length > 0) cost = Math.max(...all);
  }
  if (cost !== null && (cost <= 0 || cost > 3000)) cost = null;

  // A fuel price is roughly $1-$5/L - if the pair is way outside that,
  // one of them was misread, so don't trust the cost.
  if (cost !== null && litres !== null) {
    const perLitre = cost / litres;
    if (perLitre < 0.8 || perLitre > 6) cost = null;
  }

  return { date, odometerKm, litres, cost };
}
