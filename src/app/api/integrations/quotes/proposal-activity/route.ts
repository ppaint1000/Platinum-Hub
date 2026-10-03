import { NextRequest, NextResponse } from "next/server";
import { verifyQuotesWebhook } from "@/lib/integrations/quotesWebhook";
import { recordProposalActivity, type ProposalActivity } from "@/lib/integrations/proposalActivity";

// The old Measures app telling the Hub about a job's online proposal - see
// recordProposalActivity. Same shared secret as the other Measures → Hub routes.
export async function POST(request: NextRequest) {
  const authError = verifyQuotesWebhook(request);
  if (authError) return authError;

  let body: ProposalActivity;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.sourceQuoteId || !["sent", "viewed", "accepted"].includes(body.event)) {
    return NextResponse.json({ error: "sourceQuoteId and a valid event are required." }, { status: 400 });
  }

  const result = await recordProposalActivity(body, request.nextUrl.origin);
  return NextResponse.json(result.body, { status: result.status });
}
