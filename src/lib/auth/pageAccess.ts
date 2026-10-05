// The page ticks on the Users page that the database checks itself
// (hub_page_ok): Production board, Schedule, Health & safety. Admins can
// always open them.
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CheckedPage = "production" | "schedule" | "safety";

export async function canOpenPage(page: CheckedPage): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("hub_page_ok", { p_page: page });
  return data === true;
}

// For a page itself: anyone without the tick goes to their landing page.
export async function requirePage(page: CheckedPage) {
  if (!(await canOpenPage(page))) redirect("/");
  return createClient();
}

// Supplier invoices: admins, and anyone with Supplier invoices ticked (e.g.
// supervisors uploading invoices). The invoice tables are admin-only in the
// database, so for a ticked non-admin the server does the work with the
// service-role client - only ever after this check. Null = no access.
export async function invoicesClient(): Promise<SupabaseClient | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: access }] = await Promise.all([
    supabase.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle<{ role: string; is_active: boolean | null }>(),
    supabase.from("user_app_access").select("invoices").eq("user_id", user.id).maybeSingle<{ invoices: boolean | null }>(),
  ]);
  if (!profile || profile.is_active === false) return null;
  if (profile.role === "admin") return supabase;
  return access?.invoices ? createAdminClient() : null;
}

export async function requireInvoices(): Promise<SupabaseClient> {
  const client = await invoicesClient();
  if (!client) redirect("/");
  return client;
}
