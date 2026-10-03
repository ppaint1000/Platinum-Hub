import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyHubProposal } from "@/lib/quotes/hubNotify";

// "Copy link" on a proposal: records it as sent, moves a draft costing to
// Sent, and tells the Hub - which emails the admins a reminder with the
// link and marks the job quoted. Staff only.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: { quoteId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.quoteId) return NextResponse.json({ error: "quoteId is required." }, { status: 400 });

  const { data: proposal } = await supabase
    .from("proposals")
    .select("id, token, quote_id")
    .eq("quote_id", body.quoteId)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: "Save the proposal first." }, { status: 404 });

  const { data: quote } = await supabase
    .from("quotes")
    .select("status, location, customers:clients(name)")
    .eq("id", body.quoteId)
    .single();

  await supabase.from("proposals").update({ sent_at: new Date().toISOString() }).eq("id", proposal.id);
  if (quote && (quote.status === "draft" || quote.status === "draft_review")) {
    await supabase.from("quotes").update({ status: "sent" }).eq("id", body.quoteId);
  }

  const hub = await notifyHubProposal({
    sourceQuoteId: body.quoteId,
    event: "sent",
    proposalUrl: `${request.nextUrl.origin}/p/${proposal.token}`,
    location: quote?.location ?? null,
    customerName: (quote?.customers as unknown as { name: string } | null)?.name ?? null,
  });
  return NextResponse.json({ ok: true, hub });
}
