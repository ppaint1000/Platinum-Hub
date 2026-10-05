import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQuotesWebhook } from "@/lib/integrations/quotesWebhook";
import { enrolDrip } from "@/lib/drips/drips";

// The website's "request a quote" form: each enquiry becomes a Request in the
// Hub (as well as the email it already sends). Called server-to-server by the
// website with the shared secret, never from a browser.
export async function POST(request: NextRequest) {
  const authError = verifyQuotesWebhook(request);
  if (authError) return authError;

  let body: { name?: string; email?: string; phone?: string; address?: string; company?: string; message?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const text = (v: unknown, max = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const name = text(body.name, 200);
  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });

  // Where they heard about us (the form's "source"), kept with the message.
  const heard = text(body.source, 200);
  const message = [text(body.message), heard ? `Heard about us: ${heard}` : null].filter(Boolean).join("\n\n") || null;

  const { data: created, error } = await createAdminClient()
    .from("requests")
    .insert({
      name,
      email: text(body.email, 200),
      phone: text(body.phone, 60),
      address: text(body.address, 300),
      company: text(body.company, 200),
      message,
      source: "website",
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // The "New enquiry" emails (Drips page).
  await enrolDrip({ trigger: "request_created", email: text(body.email, 200), name, requestId: created.id });
  return NextResponse.json({ ok: true });
}
