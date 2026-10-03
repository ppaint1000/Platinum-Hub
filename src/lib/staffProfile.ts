// A person's own details for proposals ("Your contact"): name, title,
// phone, email, bio, photo and signature (supabase/staff_profiles_and_checklists.sql).

export type StaffProfile = {
  phone: string | null;
  title: string | null;
  bio: string | null;
  photo_path: string | null;
  signature_path: string | null;
};

export const STAFF_PROFILE_BUCKET = "staff-profiles";

export function staffImageUrl(path: string | null): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${STAFF_PROFILE_BUCKET}/${path}`;
}
