import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQuotesWebhook } from "@/lib/integrations/quotesWebhook";

type Body = {
  sourceCustomerId: string;
  name: string;
  notes?: string | null;
};

// Lets Measures pull the Hub's existing client list (see
// src/app/api/hub-sync/customers/pull in the Measures app) so clients
// created in the Hub — not just ones pushed in from Measures — show up as
// customers there too.
export async function GET(request: NextRequest) {
  const authError = verifyQuotesWebhook(request);
  if (authError) return authError;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clients")
    .select("id, name, notes")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    clients: (data ?? []).map((c) => ({
      sourceClientId: c.id,
      name: c.name,
      notes: c.notes,
    })),
  });
}

export async function POST(request: NextRequest) {
  const authError = verifyQuotesWebhook(request);
  if (authError) return authError;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!body.sourceCustomerId || !body.name?.trim()) {
    return NextResponse.json(
      { error: "sourceCustomerId and name are required." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clients")
    .upsert(
      {
        source_quote_customer_id: body.sourceCustomerId,
        name: body.name.trim(),
        notes: body.notes ?? null,
      },
      { onConflict: "source_quote_customer_id" }
    )
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ clientId: data.id });
}
