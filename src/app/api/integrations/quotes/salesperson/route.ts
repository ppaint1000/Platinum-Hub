import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyQuotesWebhook } from "@/lib/integrations/quotesWebhook";
import { staffImageUrl, type StaffProfile } from "@/lib/staffProfile";

// The Costing app (Measures) asking who the salesperson on a quote is, for
// the "Your contact" box on its proposal: the job's salesperson's name,
// title, phone, email, bio, photo and signature (their Profile page).
// Same shared secret as the other Measures → Hub routes.
export async function GET(request: NextRequest) {
  const authError = verifyQuotesWebhook(request);
  if (authError) return authError;

  const sourceQuoteId = request.nextUrl.searchParams.get("sourceQuoteId");
  if (!sourceQuoteId) return NextResponse.json({ error: "sourceQuoteId is required." }, { status: 400 });

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("jobs")
    .select("lead_by_user_id")
    .eq("source_quote_id", sourceQuoteId)
    .maybeSingle<{ lead_by_user_id: string | null }>();
  if (!job?.lead_by_user_id) return NextResponse.json({ contact: null });

  const [{ data: person }, { data: details }] = await Promise.all([
    admin.from("profiles").select("full_name, email").eq("id", job.lead_by_user_id).maybeSingle<{ full_name: string; email: string | null }>(),
    admin
      .from("staff_profiles")
      .select("phone, title, bio, photo_path, signature_path")
      .eq("user_id", job.lead_by_user_id)
      .maybeSingle<StaffProfile>(),
  ]);
  if (!person) return NextResponse.json({ contact: null });

  return NextResponse.json({
    contact: {
      name: person.full_name,
      email: person.email,
      title: details?.title ?? null,
      phone: details?.phone ?? null,
      bio: details?.bio ?? null,
      photoUrl: staffImageUrl(details?.photo_path ?? null),
      signatureUrl: staffImageUrl(details?.signature_path ?? null),
    },
  });
}
