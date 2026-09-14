import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppKey = "fleet" | "orders" | "jobs" | "sales" | "timesheets";

/** Gates a page to users with access to `app` (admins always pass), redirecting everyone else to the Hub. */
export async function requireAppAccess(app: AppKey) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();

  if (profile?.role === "admin") {
    return supabase;
  }

  const { data: access } = await supabase
    .from("user_app_access")
    .select(app)
    .eq("user_id", user?.id ?? "")
    .maybeSingle<Record<AppKey, boolean>>();

  if (!access?.[app]) {
    redirect("/hub");
  }

  return supabase;
}
