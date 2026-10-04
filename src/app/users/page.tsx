// Users — add, deactivate, or delete staff, and set which apps (and which
// one they land on after signing in) each person can reach. Admin-only.
import { DASHBOARD_THEME } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { Panel } from "@/components/ui";
import { UsersTable, type UserRow, type PayRate } from "@/components/users/UsersTable";
import type { StaffType } from "@/components/users/UserMore";
import { createAdminClient } from "@/lib/supabase/admin";
import { NewUserForm } from "@/components/users/NewUserForm";
import { loadNoRate, type NoRatePerson } from "@/lib/jobs/hoursApproval";

type RateRow = {
  user_id: string;
  employment_type: "contractor" | "employee";
  hourly_rate: number;
  hours_per_week: number;
  annual_leave_weeks: number;
  sick_leave_days: number;
  public_holidays: number;
};

export default async function UsersPage() {
  const supabase = await requireAdmin();

  const [{ data: profiles }, { data: rateRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, email, role, is_active, staff_type_id, user_app_access(timesheets, fleet, orders, jobs, sales, sales_authority, default_app, measures, costing)"
      )
      .is("deleted_at", null)
      .order("is_active", { ascending: false })
      .order("full_name")
      .returns<UserRow[]>(),
    supabase
      .from("staff_hourly_rates")
      .select(
        "user_id, employment_type, hourly_rate, hours_per_week, annual_leave_weeks, sick_leave_days, public_holidays, effective_from"
      )
      // Most recent first, per user, so the reduce below keeps only each
      // person's current (latest-effective) rate — older ones stay in the
      // table for job_labour_actual() to match past shifts against, but
      // this page only ever shows/edits the current one.
      .order("effective_from", { ascending: false })
      .returns<(RateRow & { effective_from: string })[]>(),
  ]);

  const rateByUser = new Map<string, PayRate>();
  for (const r of rateRows ?? []) {
    if (rateByUser.has(r.user_id)) continue;
    rateByUser.set(r.user_id, {
      employmentType: r.employment_type,
      hourlyRate: Number(r.hourly_rate),
      hoursPerWeek: Number(r.hours_per_week),
      annualLeaveWeeks: Number(r.annual_leave_weeks),
      sickLeaveDays: Number(r.sick_leave_days),
      publicHolidays: Number(r.public_holidays),
    });
  }
  // Staff types for the More panel, and who was invited but hasn't signed
  // in yet (so their invite can be sent again).
  const [{ data: staffTypes }, { data: authUsers }] = await Promise.all([
    supabase.from("staff_types").select("id, name").eq("is_active", true).order("name").returns<StaffType[]>(),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const neverSignedIn = new Set((authUsers?.users ?? []).filter((u) => !u.last_sign_in_at).map((u) => u.id));
  const rows = (profiles ?? []).map((p) => ({
    ...p,
    payRate: rateByUser.get(p.id) ?? null,
    pending: neverSignedIn.has(p.id),
  }));

  // People with hours on jobs but no hourly rate for those days - their
  // hours cost $0 on jobs until a rate is set (see Jobs → Hours to approve).
  let noRate: NoRatePerson[] = [];
  try {
    noRate = await loadNoRate(supabase);
  } catch {
    // Not shown if it can't be worked out.
  }

  return (
    // Wider than the other admin pages - the table has a dozen columns. On
    // screens narrower than that it scrolls sideways inside the Panel
    // rather than spilling past its border.
    // The Hub top bar like every other page, but a wider body than most.
    <div
      className={`${dashboardFontClass} flex min-h-screen flex-col bg-[#F5F4F0] [font-family:var(--font-body)]`}
      style={DASHBOARD_THEME}
    >
      <TopBar items={ADMIN_NAV} activeHref="/users" />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink">Users and access</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {rows.length} {rows.length === 1 ? "person" : "people"}
          </p>
        </div>
        <NewUserForm staffTypes={staffTypes ?? []} />
      </div>

      {noRate.length > 0 && (
        <div className="mb-4 rounded-lg border border-[#F2C94C] bg-[#FFF8E1] p-4 text-sm">
          <p className="font-semibold text-ink">No hourly rate set</p>
          <p className="mt-0.5 text-ink-soft">
            These people have hours on jobs that cost $0 until you set their rate below with &ldquo;Set rate&rdquo;. A first
            rate covers their past shifts too.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {noRate.map((p) => (
              <li key={p.user_id}>
                <span className="font-semibold">{p.person ?? "Unknown"}</span>{" "}
                <span className="text-ink-soft">{p.hours.toFixed(1)} hrs on jobs</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Panel className="overflow-x-auto p-4">
        <UsersTable users={rows} staffTypes={staffTypes ?? []} />
      </Panel>
      </main>
    </div>
  );
}
