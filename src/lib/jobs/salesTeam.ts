// The sales team is whoever has the "sales" access flag on /users — the same
// list the Sales page builds its per-person cards from — not everyone with
// role='sales', so an admin who's opted themselves in shows up here too.
// A job's lead_by_user_id is what the Sales page buckets quoted $ by, so
// this is the list of people a quote can be credited to.
import { requireAppAccess } from "@/lib/auth/requireAppAccess";

type Supabase = Awaited<ReturnType<typeof requireAppAccess>>;

export type SalesTeamMember = { id: string; name: string };

export async function fetchSalesTeam(supabase: Supabase): Promise<SalesTeamMember[]> {
  const { data: access } = await supabase.from("user_app_access").select("user_id").eq("sales", true);
  const ids = (access ?? []).map((a) => a.user_id);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids)
    .order("full_name")
    .returns<{ id: string; full_name: string }[]>();

  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name }));
}

// Jobs brought across into the Hub - via the Platinum Quotes webhook or a
// bulk import - arrive without a sales person, so they can't be credited on
// the Sales page until someone picks one. Jobs added by hand already require
// one (createJobAction), so "no sales person" is the whole test; not keyed
// on source_quote_id since bulk-imported jobs don't carry one. Derived
// rather than stored, so every brought-across job - past and future - is
// caught the moment it lands and clears itself once someone is assigned.
export function needsSalesPerson(job: { lead_by_user_id: string | null }) {
  return !job.lead_by_user_id;
}
