import type { SupabaseClient } from "@supabase/supabase-js";

// A new customer typed in on a costing or site measure: a Hub client, with
// whoever added it as its salesperson.
export async function addClient(supabase: SupabaseClient, name: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return supabase
    .from("clients")
    .insert({ name: name.trim(), sales_person_id: user?.id ?? null })
    .select("id, name")
    .single<{ id: string; name: string }>();
}
