// The top bar for whoever is looking: admins get every app, supervisors the
// Production board and timesheets, everyone else the apps ticked for them.
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { ADMIN_NAV, SUPERVISOR_NAV, staffNav, type NavItem } from "@/components/dashboard/TopBar";

type Access = {
  timesheets: boolean;
  jobs: boolean;
  orders: boolean;
  fleet: boolean;
  sales: boolean;
  sales_authority: boolean;
  measures: boolean;
  costing: boolean;
  production?: boolean;
  schedule?: boolean;
  safety?: boolean;
  invoices?: boolean;
};

export async function navForViewer(): Promise<NavItem[]> {
  const profile = await getCurrentProfile();
  if (profile.role === "admin") return ADMIN_NAV;
  const supabase = await createClient();
  const { data: access } = await supabase
    .from("user_app_access")
    .select("timesheets, jobs, orders, fleet, sales, sales_authority, measures, costing, production, schedule, safety, invoices")
    .eq("user_id", profile.id)
    .maybeSingle<Access>();
  if (profile.role === "supervisor") {
    // Their timesheets admin always; Production, Schedule, Costing /
    // Measures and Health & safety if ticked for them, before "All apps".
    const ticked = staffNav({
      measures: access?.measures,
      costing: access?.costing,
      production: access?.production,
      schedule: access?.schedule,
      safety: access?.safety,
      invoices: access?.invoices,
    }).filter((i) => i.href !== "/hub");
    const [timesheets, allApps] = [SUPERVISOR_NAV.find((i) => i.href === "/timesheets/admin")!, SUPERVISOR_NAV[SUPERVISOR_NAV.length - 1]];
    return [...ticked.filter((i) => i.href === "/production" || i.href === "/schedule"), timesheets, ...ticked.filter((i) => i.href !== "/production" && i.href !== "/schedule"), allApps];
  }
  return staffNav({
    timesheets: access?.timesheets,
    jobs: access?.jobs,
    orders: access?.orders,
    fleet: access?.fleet,
    salesAuthority: access?.sales_authority,
    measures: access?.measures,
    costing: access?.costing,
    production: access?.production,
    schedule: access?.schedule,
    safety: access?.safety,
    invoices: access?.invoices,
    sales: access?.sales || profile.role === "sales",
    painter: profile.role === "painter",
  });
}
