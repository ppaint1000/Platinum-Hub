import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyHubProposal } from "@/lib/quotes/hubNotify";

type Row = {
  proposal: {
    quote_id: string;
    view_count: number;
    last_viewed_at: string | null;
    accepted_at: string | null;
    accepted_name: string | null;
    accepted_total: number | null;
    accepted_options: string[] | null;
  };
  quote: { location: string | null };
  customer: { name: string | null };
};

// Called by the customer's proposal page after it's opened or accepted, to
// tell the Hub. Public (no sign-in): it only passes on what the database
// already recorded for this token - nothing the caller sends is trusted.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string; event: string }> }) {
  const { token, event } = await params;
  if (event !== "viewed" && event !== "accepted") {
    return NextResponse.json({ error: "Unknown event." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("proposal_by_token", { p_token: token });
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const row = data as Row;
  if (event === "accepted" && !row.proposal.accepted_at) {
    return NextResponse.json({ error: "Not accepted." }, { status: 409 });
  }

  const result = await notifyHubProposal({
    sourceQuoteId: row.proposal.quote_id,
    event,
    proposalUrl: `${request.nextUrl.origin}/p/${token}`,
    location: row.quote.location,
    customerName: row.customer.name,
    viewCount: row.proposal.view_count,
    lastViewedAt: row.proposal.last_viewed_at,
    acceptedName: row.proposal.accepted_name,
    acceptedTotal: row.proposal.accepted_total,
    acceptedOptions: row.proposal.accepted_options ?? [],
  });
  return NextResponse.json(result);
}
