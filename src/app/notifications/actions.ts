"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { EMAIL_NOTIFICATIONS } from "@/lib/notifications/catalog";
import { audienceOf } from "@/lib/notifications/recipients";

// Saves the signed-in person's own choices. Only notifications that apply
// to them, and only the options each one offers.
export async function saveNotificationPrefsAction(prefs: { key: string; enabled: boolean; scope: string | null }[]) {
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const { data: access } = await supabase
    .from("user_app_access")
    .select("sales")
    .eq("user_id", profile.id)
    .maybeSingle<{ sales: boolean }>();
  const aud = audienceOf(profile.role, !!access?.sales);
  if (!aud) return { error: "There are no notifications for your role." };

  const rows = prefs
    .map((p) => {
      const n = EMAIL_NOTIFICATIONS.find((x) => x.key === p.key);
      if (!n || !n.audiences.includes(aud)) return null;
      const scope = n.options?.some((o) => o.value === p.scope) ? p.scope : null;
      return { user_id: profile.id, key: n.key, enabled: !!p.enabled, scope, updated_at: new Date().toISOString() };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (rows.length === 0) return {};

  const { error } = await supabase.from("notification_preferences").upsert(rows, { onConflict: "user_id,key" });
  if (error) return { error: error.message };

  revalidatePath("/notifications");
  return {};
}
