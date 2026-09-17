"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AccessApp, DefaultApp, Role } from "@/lib/users/access";

function generateTempPassword() {
  return randomBytes(9).toString("base64url");
}

export async function createUserAction(input: {
  fullName: string;
  email: string;
  role: Role;
  access: Record<AccessApp, boolean>;
  defaultApp: DefaultApp;
}) {
  await requireAdmin();

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: input.email,
    password: tempPassword,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Could not create the login." };
  }

  const userId = created.user.id;

  // Supabase already has a trigger that creates a bare profiles row when a
  // new Auth user is made — upsert rather than insert so we fill it in
  // instead of colliding with it.
  const { error: profileError } = await admin.from("profiles").upsert({
    id: userId,
    full_name: input.fullName,
    email: input.email,
    role: input.role,
    is_active: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return { error: profileError.message };
  }

  const { error: accessError } = await admin.from("user_app_access").insert({
    user_id: userId,
    ...input.access,
    default_app: input.defaultApp,
  });

  if (accessError) {
    await admin.auth.admin.deleteUser(userId);
    await admin.from("profiles").delete().eq("id", userId);
    return { error: accessError.message };
  }

  revalidatePath("/users");
  return { tempPassword };
}

export async function updateAccessAction(userId: string, app: AccessApp, granted: boolean) {
  const supabase = await requireAdmin();

  const { data: current } = await supabase
    .from("user_app_access")
    .select("timesheets, fleet, orders, jobs, sales, default_app")
    .eq("user_id", userId)
    .maybeSingle<Record<AccessApp, boolean> & { default_app: DefaultApp }>();

  const nextFlags: Record<AccessApp, boolean> = {
    timesheets: current?.timesheets ?? true,
    fleet: current?.fleet ?? false,
    orders: current?.orders ?? false,
    jobs: current?.jobs ?? false,
    sales: current?.sales ?? false,
    [app]: granted,
  };
  const hasHubAccess = nextFlags.fleet || nextFlags.orders || nextFlags.jobs || nextFlags.sales;
  const currentDefault = current?.default_app ?? "timesheets";

  // Re-validate the stored default against the flags as they'll be after
  // this change — 'hub' is only reachable with at least one Hub-side app
  // enabled, and any specific app default requires that app's own flag.
  const defaultStillValid =
    currentDefault === "hub" ? hasHubAccess : nextFlags[currentDefault as AccessApp];

  const update: Record<string, unknown> = { [app]: granted, updated_at: new Date().toISOString() };
  if (!defaultStillValid) {
    update.default_app = hasHubAccess ? "hub" : "timesheets";
  }

  const { error } = await supabase.from("user_app_access").update(update).eq("user_id", userId);
  if (error) return { error: error.message };

  revalidatePath("/users");
  return {};
}

export async function updateSalesAuthorityAction(userId: string, granted: boolean) {
  const supabase = await requireAdmin();

  const { error } = await supabase
    .from("user_app_access")
    .update({ sales_authority: granted, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) return { error: error.message };

  revalidatePath("/users");
  return {};
}

export async function updateDefaultAppAction(userId: string, app: DefaultApp) {
  const supabase = await requireAdmin();

  const { data: access } = await supabase
    .from("user_app_access")
    .select("timesheets, fleet, orders, jobs, sales")
    .eq("user_id", userId)
    .maybeSingle<Record<AccessApp, boolean>>();

  const isValid =
    app === "hub"
      ? !!access?.fleet || !!access?.orders || !!access?.jobs || !!access?.sales
      : !!access?.[app];

  if (!isValid) {
    return { error: "That app isn't enabled for this user." };
  }

  const { error } = await supabase
    .from("user_app_access")
    .update({ default_app: app, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) return { error: error.message };

  revalidatePath("/users");
  return {};
}

export async function updateRoleAction(userId: string, role: Role) {
  const supabase = await requireAdmin();

  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/users");
  return {};
}

export async function updateActiveAction(userId: string, isActive: boolean) {
  await requireAdmin();

  const admin = createAdminClient();

  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: isActive ? "none" : "876000h",
  });
  if (banError) return { error: banError.message };

  const { error: profileError } = await admin
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", userId);
  if (profileError) return { error: profileError.message };

  revalidatePath("/users");
  return {};
}

export async function resetPasswordAction(userId: string) {
  await requireAdmin();

  const admin = createAdminClient();
  const tempPassword = generateTempPassword();

  const { error } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
  if (error) return { error: error.message };

  return { tempPassword };
}

// staff_hourly_rates is admin-only end to end: RLS on the table itself
// restricts it to admins, this page is already requireAdmin()-gated, and
// no other query in the app ever selects from it — only the
// job_labour_actual() SQL function reads it, and that only ever returns
// an aggregate $ total, never a rate. See
// supabase/staff_hourly_rates_labour_cost.sql and
// supabase/staff_hourly_rates_history.sql.
//
// Every save inserts a new dated row rather than overwriting the
// existing one, so a rate change never rewrites the cost of work already
// logged under the old rate (see job_labour_actual — it matches each
// shift to whichever rate was in effect on that shift's date). The first
// rate ever entered for someone is backdated so it covers whatever
// timesheet history already exists for them; every rate after that is
// effective from today, i.e. a pay rise only affects work logged from
// now on.
export async function updateHourlyRateAction(
  userId: string,
  input: {
    employmentType: "contractor" | "employee";
    hourlyRate: number;
    hoursPerWeek: number;
    annualLeaveWeeks: number;
    sickLeaveDays: number;
    publicHolidays: number;
  }
) {
  const supabase = await requireAdmin();

  if (!Number.isFinite(input.hourlyRate) || input.hourlyRate < 0) {
    return { error: "Enter a valid hourly rate." };
  }
  if (!Number.isFinite(input.hoursPerWeek) || input.hoursPerWeek <= 0) {
    return { error: "Enter valid hours per week." };
  }
  for (const [label, value] of [
    ["annual leave weeks", input.annualLeaveWeeks],
    ["sick leave days", input.sickLeaveDays],
    ["public holidays", input.publicHolidays],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      return { error: `Enter a valid number for ${label}.` };
    }
  }

  const { count: existingCount } = await supabase
    .from("staff_hourly_rates")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  const effectiveFrom =
    (existingCount ?? 0) > 0 ? new Date().toISOString().slice(0, 10) : "2020-01-01";

  const { error } = await supabase.from("staff_hourly_rates").insert({
    user_id: userId,
    employment_type: input.employmentType,
    hourly_rate: input.hourlyRate,
    hours_per_week: input.hoursPerWeek,
    annual_leave_weeks: input.annualLeaveWeeks,
    sick_leave_days: input.sickLeaveDays,
    public_holidays: input.publicHolidays,
    effective_from: effectiveFrom,
  });

  if (error) return { error: error.message };

  revalidatePath("/users");
  return {};
}

export async function deleteUserAction(userId: string) {
  await requireAdmin();

  const admin = createAdminClient();

  const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);
  if (deleteAuthError) return { error: deleteAuthError.message };

  const { error: deleteProfileError } = await admin.from("profiles").delete().eq("id", userId);

  if (deleteProfileError) {
    // A restrict FK (e.g. fleet fuel/service history referencing this
    // driver) blocked the hard delete — keep the profile for that history,
    // but mark it gone so the Users list hides it and it can never be
    // reactivated the way a plain deactivation could be.
    await admin
      .from("profiles")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", userId);
  }

  revalidatePath("/users");
  return {};
}
