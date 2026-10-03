import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { upsertJobFromCosting } from "@/lib/integrations/costingJob";
import type { QuoteStatus } from "@/lib/integrations/quotesWebhook";

// A costing was saved: update its job (see upsertJobFromCosting). The
// costing is read as the signed-in person, so they can only update the job
// for a costing they can see.
export async function POST(request: NextRequest) {
  let body: { quoteId?: string; name?: string; status?: QuoteStatus; quotedSellTotal?: number | null; quotedHours?: number | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.quoteId || !body.name?.trim() || !body.status) {
    return NextResponse.json({ error: "quoteId, name and status are required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("customer_id, owner_id, work_order_token")
    .eq("id", body.quoteId)
    .maybeSingle<{ customer_id: string; owner_id: string | null; work_order_token: string | null }>();
  if (!quote) return NextResponse.json({ error: "Costing not found." }, { status: 404 });

  const { data, error } = await upsertJobFromCosting({
    quoteId: body.quoteId,
    clientId: quote.customer_id,
    name: body.name,
    status: body.status,
    quotedSellTotal: body.quotedSellTotal ?? null,
    quotedHours: body.quotedHours ?? null,
    workOrderUrl: quote.work_order_token ? `${request.nextUrl.origin}/w/${quote.work_order_token}` : null,
    ownerId: quote.owner_id,
  });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Couldn't save the job." }, { status: 500 });
  return NextResponse.json({ jobId: data.id, jobNumber: data.job_number });
}
