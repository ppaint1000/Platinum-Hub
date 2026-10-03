// The costing's salesperson (the job's lead) and their Profile page details,
// for the "Your contact" box on proposals (switched off for now - see the
// proposal link page). Server-side only. Never throws: no contact box is
// better than no proposal.
import { createAdminClient } from "@/lib/supabase/admin";
import { staffImageUrl, type StaffProfile } from "@/lib/staffProfile";

export type SalesContact = {
  name: string;
  email: string | null;
  title: string | null;
  phone: string | null;
  bio: string | null;
  photoUrl: string | null;
  signatureUrl: string | null;
};

export async function fetchSalesContact(quoteId: string | null | undefined): Promise<SalesContact | null> {
  if (!quoteId) return null;
  try {
    const admin = createAdminClient();
    const { data: job } = await admin
      .from("jobs")
      .select("lead_by_user_id")
      .eq("source_quote_id", quoteId)
      .maybeSingle<{ lead_by_user_id: string | null }>();
    if (!job?.lead_by_user_id) return null;
    const [{ data: person }, { data: details }] = await Promise.all([
      admin.from("profiles").select("full_name, email").eq("id", job.lead_by_user_id).maybeSingle<{ full_name: string; email: string | null }>(),
      admin
        .from("staff_profiles")
        .select("phone, title, bio, photo_path, signature_path")
        .eq("user_id", job.lead_by_user_id)
        .maybeSingle<StaffProfile>(),
    ]);
    if (!person) return null;
    return {
      name: person.full_name,
      email: person.email,
      title: details?.title ?? null,
      phone: details?.phone ?? null,
      bio: details?.bio ?? null,
      photoUrl: staffImageUrl(details?.photo_path ?? null),
      signatureUrl: staffImageUrl(details?.signature_path ?? null),
    };
  } catch (e) {
    console.error("[hubContact] lookup failed", e);
    return null;
  }
}
