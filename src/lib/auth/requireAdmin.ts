import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Gates a Jobs page to admins only, redirecting everyone else to the Hub. */
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .single();

  if (profile?.role !== "admin") {
    redirect("/hub");
  }

  return supabase;
}
