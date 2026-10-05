// Who's looking at Health & safety, and the lists its forms pick from.
// Managers (admins, and supervisors with the tick) see everyone's reports,
// set tasks, and keep the hazard register, documents and contractors;
// everyone else with the tick fills in reports and sees their own.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePage } from "@/lib/auth/pageAccess";

export type SafetyContext = {
  userId: string;
  isManager: boolean;
  isAdmin: boolean;
};

export async function safetyContext(): Promise<SafetyContext & { supabase: Awaited<ReturnType<typeof createClient>> }> {
  const supabase = await requirePage("safety");
  const [{ data: auth }, { data: manager }, { data: role }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("safety_manager"),
    supabase.rpc("current_profile_role"),
  ]);
  return { supabase, userId: auth.user?.id ?? "", isManager: manager === true, isAdmin: role === "admin" };
}

// Clock-in sites to pick from (painters can't read the sites table, so
// only the names come through here).
export async function safetySites(): Promise<{ id: string; name: string }[]> {
  const { data } = await createAdminClient()
    .from("sites")
    .select("id, name, customers:clients(name)")
    .eq("is_active", true)
    .order("name")
    .returns<{ id: string; name: string; customers: { name: string } | { name: string }[] | null }[]>();
  return (data ?? []).map((s) => {
    const c = Array.isArray(s.customers) ? s.customers[0]?.name : s.customers?.name;
    return { id: s.id, name: c ? `${s.name} (${c})` : s.name };
  });
}

// Active staff (for assigning tasks, and names on reports).
export async function safetyStaff(): Promise<{ id: string; full_name: string }[]> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("full_name")
    .returns<{ id: string; full_name: string }[]>();
  return data ?? [];
}

export const fmtDay = (key: string | null) =>
  key
    ? new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : "—";
