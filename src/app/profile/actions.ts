"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile } from "@/lib/supabase/profile";

// Saves the signed-in person's own profile. The images are uploaded from
// the browser into their own folder first; this stores where they are.
export async function saveProfileAction(input: {
  fullName: string;
  phone: string;
  title: string;
  bio: string;
  photoPath: string | null;
  signaturePath: string | null;
}) {
  const profile = await getCurrentProfile();
  const name = input.fullName.trim();
  if (!name) return { error: "Your name can't be blank." };

  // Only paths in their own folder.
  const own = (p: string | null) => (p && p.startsWith(`${profile.id}/`) ? p : null);

  const supabase = await createClient();
  const { error } = await supabase.from("staff_profiles").upsert(
    {
      user_id: profile.id,
      phone: input.phone.trim() || null,
      title: input.title.trim() || null,
      bio: input.bio.trim() || null,
      photo_path: own(input.photoPath),
      signature_path: own(input.signaturePath),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) return { error: error.message };

  // Their name is on profiles, which staff can't edit directly - only their
  // own row, only the name.
  if (name !== profile.full_name) {
    const { error: nameError } = await createAdminClient().from("profiles").update({ full_name: name }).eq("id", profile.id);
    if (nameError) return { error: nameError.message };
  }

  revalidatePath("/profile");
  return {};
}
