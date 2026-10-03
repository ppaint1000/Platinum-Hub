import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQuotesWebhook, type QuoteStatus } from "@/lib/integrations/quotesWebhook";
import { upsertJobFromCosting } from "@/lib/integrations/costingJob";

type Body = {
  sourceQuoteId: string;
  sourceCustomerId: string | null;
  name: string;
  status: QuoteStatus;
  quotedSellTotal: number | null;
  quotedHours: number | null;
  quotedAt?: string | null;
  // The crew's work order link (/w/<token> in the Costing app), shown on
  // the job's site when clocking in.
  workOrderUrl?: string | null;
};

export async function POST(request: NextRequest) {
  const authError = verifyQuotesWebhook(request);
  if (authError) return authError;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.sourceQuoteId || !body.name?.trim() || !body.status) {
    return NextResponse.json(
      { error: "sourceQuoteId, name and status are required." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  let clientId: string | null = null;
  if (body.sourceCustomerId) {
    const { data: client } = await admin
      .from("clients")
      .select("id")
      .eq("source_quote_customer_id", body.sourceCustomerId)
      .maybeSingle();
    clientId = client?.id ?? null;
  }

  const { data, error } = await upsertJobFromCosting({
    quoteId: body.sourceQuoteId,
    clientId,
    name: body.name,
    status: body.status,
    quotedSellTotal: body.quotedSellTotal,
    quotedHours: body.quotedHours,
    quotedAt: body.quotedAt,
    workOrderUrl: body.workOrderUrl,
  });

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Couldn't save the job." }, { status: 500 });

  return NextResponse.json({ jobId: data.id, jobNumber: data.job_number });
}
