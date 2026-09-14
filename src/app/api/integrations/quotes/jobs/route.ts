import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyQuotesWebhook,
  mapQuoteStatusToJobStatus,
  type QuoteStatus,
} from "@/lib/integrations/quotesWebhook";

type Body = {
  sourceQuoteId: string;
  sourceCustomerId: string | null;
  name: string;
  status: QuoteStatus;
  quotedSellTotal: number | null;
  quotedHours: number | null;
  quotedAt?: string | null;
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

  const { data, error } = await admin
    .from("jobs")
    .upsert(
      {
        source_quote_id: body.sourceQuoteId,
        client_id: clientId,
        name: body.name.trim(),
        status: mapQuoteStatusToJobStatus(body.status),
        quoted_sell_total: body.quotedSellTotal,
        quoted_hours: body.quotedHours,
        quoted_at: body.quotedAt ?? null,
      },
      { onConflict: "source_quote_id" }
    )
    .select("id, job_number")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ jobId: data.id, jobNumber: data.job_number });
}
