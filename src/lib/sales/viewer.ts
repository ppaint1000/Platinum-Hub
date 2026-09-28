// Who is looking at a sales dashboard, and which apps they can open - for
// the top bar and for deciding whose dashboards they may view.
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { ADMIN_NAV, staffNav, type NavItem } from "@/components/dashboard/TopBar";

type Access = {
  timesheets: boolean;
  jobs: boolean;
  orders: boolean;
  fleet: boolean;
  sales_authority: boolean;
};

export async function getSalesViewer() {
  const supabase = await requireAppAccess("sales");
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? "";

  const [{ data: profile }, { data: access }] = await Promise.all([
    supabase.from("profiles").select("full_name, role").eq("id", userId).single<{ full_name: string; role: string }>(),
    supabase
      .from("user_app_access")
      .select("timesheets, jobs, orders, fleet, sales_authority")
      .eq("user_id", userId)
      .maybeSingle<Access>(),
  ]);

  const isAdmin = profile?.role === "admin";
  const canSeeAll = isAdmin || !!access?.sales_authority;

  // Admins keep their full top bar; everyone else only sees their own apps.
  function nav(): NavItem[] {
    if (isAdmin) return ADMIN_NAV;
    return staffNav({
      timesheets: access?.timesheets,
      jobs: access?.jobs,
      orders: access?.orders,
      fleet: access?.fleet,
      salesAuthority: access?.sales_authority,
    });
  }

  return {
    supabase,
    userId,
    fullName: profile?.full_name ?? "",
    isAdmin,
    canSeeAll,
    canOpenJobs: isAdmin || !!access?.jobs,
    nav,
  };
}
