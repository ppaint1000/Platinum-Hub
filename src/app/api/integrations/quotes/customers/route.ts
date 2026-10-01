import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQuotesWebhook } from "@/lib/integrations/quotesWebhook";

type Body = {
  sourceCustomerId: string;
  name: string;
  notes?: string | null;
  // Sent only when the Costing app has them - left alone when missing.
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  // Who created/saved the customer in the Costing app: becomes the
  // client's salesperson if the client is new and they're on the sales team.
  createdByEmail?: string | null;
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
    .select("id, name, notes, email, phone, address")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    clients: (data ?? []).map((c) => ({
      sourceClientId: c.id,
      name: c.name,
      notes: c.notes,
      email: c.email,
      phone: c.phone,
      address: c.address,
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
  const fields: Record<string, string | null> = { name: body.name.trim(), notes: body.notes ?? null };
  for (const key of ["email", "phone", "address"] as const) {
    if (body[key] !== undefined) fields[key] = body[key]?.trim() || null;
  }

  const { data: existing } = await admin
    .from("clients")
    .select("id")
    .eq("source_quote_customer_id", body.sourceCustomerId)
    .maybeSingle<{ id: string }>();
  if (existing) {
    // Never changes the salesperson - only an admin does that, in the Hub.
    const { error } = await admin.from("clients").update(fields).eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ clientId: existing.id });
  }

  const { data, error } = await admin
    .from("clients")
    .insert({
      source_quote_customer_id: body.sourceCustomerId,
      ...fields,
      sales_person_id: await salesPersonByEmail(admin, body.createdByEmail),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ clientId: data.id });
}

async function salesPersonByEmail(admin: ReturnType<typeof createAdminClient>, email: string | null | undefined) {
  if (!email?.trim()) return null;
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    // Exact match, ignoring case (escaping the LIKE wildcards).
    .ilike("email", email.trim().replace(/[%_\\]/g, "\\$&"))
    .maybeSingle<{ id: string }>();
  if (!profile) return null;
  const { data: access } = await admin
    .from("user_app_access")
    .select("sales")
    .eq("user_id", profile.id)
    .maybeSingle<{ sales: boolean }>();
  return access?.sales ? profile.id : null;
}
