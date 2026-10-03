// The top bar for whoever is looking: admins get every app, supervisors the
// Production board and timesheets, everyone else the apps ticked for them.
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { ADMIN_NAV, SUPERVISOR_NAV, staffNav, type NavItem } from "@/components/dashboard/TopBar";

type Access = { timesheets: boolean; jobs: boolean; orders: boolean; fleet: boolean; sales: boolean; sales_authority: boolean };

export async function navForViewer(): Promise<NavItem[]> {
  const profile = await getCurrentProfile();
  if (profile.role === "admin") return ADMIN_NAV;
  if (profile.role === "supervisor") return SUPERVISOR_NAV;
  const supabase = await createClient();
  const { data: access } = await supabase
    .from("user_app_access")
    .select("timesheets, jobs, orders, fleet, sales, sales_authority")
    .eq("user_id", profile.id)
    .maybeSingle<Access>();
  return staffNav({
    timesheets: access?.timesheets,
    jobs: access?.jobs,
    orders: access?.orders,
    fleet: access?.fleet,
    salesAuthority: access?.sales_authority,
  });
}
