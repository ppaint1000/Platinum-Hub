// Who can log order numbers: admins, and anyone with "Log an order" ticked
// on Users -> Page access (supervisors start ticked).
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function canLogOrders(): Promise<{ ok: boolean; admin: boolean }> {
  const profile = await getCurrentProfile();
  if (profile.role === "admin") return { ok: true, admin: true };
  const { data } = await createAdminClient().from("user_app_access").select("order_log").eq("user_id", profile.id).maybeSingle();
  return { ok: !!data?.order_log, admin: false };
}
