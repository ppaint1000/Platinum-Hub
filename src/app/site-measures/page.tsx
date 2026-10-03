import { createClient } from "@/lib/supabase/server";
import { SiteMeasuresClient } from "@/components/quotes/SiteMeasuresClient";
import { fetchMcOwners, requireMcAccess } from "@/lib/quotes/mcAccess";

export default async function SiteMeasuresPage() {
  const supabase = await createClient();
  const access = await requireMcAccess("measures");
  // Admins see everyone's measures, and whose each one is.
  const owners = access.isAdmin ? await fetchMcOwners() : null;

  const [{ data: measures }, { data: customers }] = await Promise.all([
    supabase
      .from("site_measures")
      .select(
        "id, customer_id, location, project, email, photos_taken, measured_on, buildings, status, created_at, sent_costing_id, owner_id"
      )
      // Whichever record was most recently added always leads, regardless
      // of customer — measured_on is the site-visit date, not entry order.
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  return <SiteMeasuresClient initialMeasures={measures ?? []} customers={customers ?? []} owners={owners} />;
}
