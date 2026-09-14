import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS and can manage Supabase Auth users
 * directly (create/ban/delete/reset password). Server-only: never import
 * this from a client component or expose SUPABASE_SERVICE_ROLE_KEY to the
 * browser.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
