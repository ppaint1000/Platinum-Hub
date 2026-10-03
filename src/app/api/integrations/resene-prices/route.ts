import { NextRequest, NextResponse } from "next/server";
import { verifyQuotesWebhook } from "@/lib/integrations/quotesWebhook";
import { editResenePrice, listResenePrices, type EditBody } from "@/lib/resene/priceApi";

// The old Measures app reading / correcting the Resene price list, with the
// same shared-secret header as the other /api/integrations/quotes routes.
export async function GET(request: NextRequest) {
  const authError = verifyQuotesWebhook(request);
  if (authError) return authError;
  const r = await listResenePrices();
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(request: NextRequest) {
  const authError = verifyQuotesWebhook(request);
  if (authError) return authError;
  let body: EditBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const r = await editResenePrice(body);
  return NextResponse.json(r.body, { status: r.status });
}
