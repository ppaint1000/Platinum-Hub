import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type McAccess = { isAdmin: boolean; measures: boolean; costing: boolean; jobs: boolean };

// Who can use Measures and Costing: admins, and anyone ticked for them on
// the Users page (who then only see their own - the database enforces
// that). Sends anyone without `app` back to the Hub.
export async function requireMcAccess(app: "measures" | "costing" | "admin"): Promise<McAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: profile }, { data: flags }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user?.id ?? "").maybeSingle<{ role: string }>(),
    supabase
      .from("user_app_access")
      .select("measures, costing, jobs")
      .eq("user_id", user?.id ?? "")
      .maybeSingle<{ measures: boolean; costing: boolean; jobs: boolean }>(),
  ]);
  const isAdmin = profile?.role === "admin";
  const access: McAccess = {
    isAdmin,
    measures: isAdmin || !!flags?.measures,
    costing: isAdmin || !!flags?.costing,
    jobs: isAdmin || !!flags?.jobs,
  };
  if (app === "admin" ? !isAdmin : !access[app]) redirect(app === "admin" ? "/costing" : "/hub");
  return access;
}

export type McOwner = { id: string; name: string };

// Who a costing or site measure can belong to: admins, and anyone ticked
// for Measures or Costing.
export async function fetchMcOwners(): Promise<McOwner[]> {
  const supabase = await createClient();
  const [{ data: admins }, { data: ticked }] = await Promise.all([
    supabase.from("profiles").select("id").eq("role", "admin").neq("is_active", false),
    supabase.from("user_app_access").select("user_id").or("measures.eq.true,costing.eq.true"),
  ]);
  const ids = [...new Set([...(admins ?? []).map((a) => a.id), ...(ticked ?? []).map((t) => t.user_id)])];
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids)
    .neq("is_active", false)
    .order("full_name")
    .returns<{ id: string; full_name: string }[]>();
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name }));
}
