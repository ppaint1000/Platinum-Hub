// Who is looking at a Sales page, and which apps they can open - for the
// top bar, the Sales tabs and deciding whose figures they may view.
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { ADMIN_NAV, staffNav, type NavItem } from "@/components/dashboard/TopBar";
import type { SalesPerson } from "./dashboard";

type Access = {
  timesheets: boolean;
  jobs: boolean;
  orders: boolean;
  fleet: boolean;
  sales: boolean;
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
      .select("timesheets, jobs, orders, fleet, sales, sales_authority")
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

  // The sales team is whoever has the "sales" flag on the Users page - the
  // same people who get a card on the Budgets page. Only admins and sales
  // authority can read the whole list (RLS).
  async function loadTeam(): Promise<SalesPerson[]> {
    const { data: salesAccess } = await supabase.from("user_app_access").select("user_id").eq("sales", true);
    const ids = (salesAccess ?? []).map((a) => a.user_id);
    if (ids.length === 0) return [];
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids)
      .order("full_name")
      .returns<{ id: string; full_name: string }[]>();
    return (data ?? []).map((p) => ({ id: p.id, name: p.full_name }));
  }

  return {
    supabase,
    userId,
    fullName: profile?.full_name ?? "",
    isAdmin,
    canSeeAll,
    inSalesTeam: !!access?.sales,
    canOpenJobs: isAdmin || !!access?.jobs,
    nav,
    loadTeam,
  };
}

export type SalesViewer = Awaited<ReturnType<typeof getSalesViewer>>;
