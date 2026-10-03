// Costing → the Hub's job for it. Customers are the Hub's clients now, so
// there's nothing to copy for them; a costing still updates its job (quoted
// $ and hours, status) via /api/costing/sync-job. Never throws - a failed
// job update must not block saving a costing.

async function post(path: string, body: unknown) {
  try {
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`[hubSync] ${path} failed`, e);
  }
}

export function pushQuoteToHub(quote: {
  id: string;
  customerId: string | null;
  name: string;
  status: string;
  total: number | null;
  totalHours: number;
}) {
  return post("/api/costing/sync-job", {
    quoteId: quote.id,
    name: quote.name,
    status: quote.status,
    quotedSellTotal: quote.total,
    quotedHours: quote.totalHours,
  });
}
