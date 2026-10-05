"use client";

import { Fragment, useState, useTransition } from "react";
import {
  updateAccessAction,
  updateDefaultAppAction,
  updateRoleAction,
  updateActiveAction,
  updateSalesAuthorityAction,
  updateMcAccessAction,
  updateHourlyRateAction,
  resetPasswordAction,
  deleteUserAction,
} from "@/app/users/actions";
import { DEFAULT_APP_OPTIONS, defaultAppAllowed, type AccessApp, type DefaultApp, type Role } from "@/lib/users/access";
import { LedgerTable } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { TempPasswordReveal } from "./TempPasswordReveal";
import { UserMore, type StaffType } from "./UserMore";
import { SetPasswordForm } from "@/app/timesheets/admin/staff/set-password-form";

export type PayRate = {
  employmentType: "contractor" | "employee";
  hourlyRate: number;
  hoursPerWeek: number;
  annualLeaveWeeks: number;
  sickLeaveDays: number;
  publicHolidays: number;
};

export type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  user_app_access: {
    timesheets: boolean;
    fleet: boolean;
    orders: boolean;
    jobs: boolean;
    sales: boolean;
    sales_authority: boolean;
    default_app: DefaultApp;
    measures: boolean;
    costing: boolean;
    production?: boolean;
    schedule?: boolean;
    safety?: boolean;
  } | null;
  payRate: PayRate | null;
  staff_type_id: string | null;
  // Invited, hasn't signed in yet.
  pending: boolean;
};

// Every page someone can be given, grouped as on the side menu. Ticked =
// they see it in their menu and can open it. Admins can open everything.
type PageKey = AccessApp | "measures" | "costing" | "sales_authority";
const PAGE_GROUPS: { title: string; pages: { key: PageKey; label: string; hint?: string }[] }[] = [
  {
    title: "Sales",
    pages: [
      { key: "measures", label: "Site measures", hint: "their own" },
      { key: "costing", label: "Costing & proposals", hint: "their own" },
      { key: "sales", label: "My sales" },
      { key: "sales_authority", label: "Team sales" },
    ],
  },
  {
    title: "Jobs",
    pages: [
      { key: "jobs", label: "Jobs & Clients" },
      { key: "production", label: "Production board", hint: "no $" },
      { key: "schedule", label: "Schedule" },
      { key: "orders", label: "Orders" },
    ],
  },
  {
    title: "Team",
    pages: [
      { key: "timesheets", label: "Clock in & timesheet" },
      { key: "fleet", label: "Fleet / log fuel" },
      { key: "safety", label: "Health & safety" },
    ],
  },
];
const ALL_PAGES = PAGE_GROUPS.flatMap((g) => g.pages);


const DEFAULT_PAY_RATE: PayRate = {
  employmentType: "employee",
  hourlyRate: 0,
  hoursPerWeek: 40,
  annualLeaveWeeks: 4,
  sickLeaveDays: 10,
  publicHolidays: 12,
};

// The pay-rate boxes hold what's typed, as text - so an emptied box stays
// empty instead of snapping back to 0, and a 0 is never shown. Converted
// to numbers only when saving / previewing (blank counts as 0).
type RateForm = {
  employmentType: PayRate["employmentType"];
  hourlyRate: string;
  hoursPerWeek: string;
  annualLeaveWeeks: string;
  sickLeaveDays: string;
  publicHolidays: string;
};

function toRateForm(r: PayRate): RateForm {
  const show = (n: number) => (n ? String(n) : "");
  return {
    employmentType: r.employmentType,
    hourlyRate: show(r.hourlyRate),
    hoursPerWeek: show(r.hoursPerWeek),
    annualLeaveWeeks: show(r.annualLeaveWeeks),
    sickLeaveDays: show(r.sickLeaveDays),
    publicHolidays: show(r.publicHolidays),
  };
}

function fromRateForm(f: RateForm): PayRate {
  return {
    employmentType: f.employmentType,
    hourlyRate: Number(f.hourlyRate) || 0,
    hoursPerWeek: Number(f.hoursPerWeek) || 0,
    annualLeaveWeeks: Number(f.annualLeaveWeeks) || 0,
    sickLeaveDays: Number(f.sickLeaveDays) || 0,
    publicHolidays: Number(f.publicHolidays) || 0,
  };
}

function effectiveRate(r: PayRate): number {
  if (r.employmentType === "contractor") return r.hourlyRate;
  const paidHoursPerYear = r.hoursPerWeek * 52;
  const nonWorkingHours =
    r.annualLeaveWeeks * r.hoursPerWeek + (r.sickLeaveDays + r.publicHolidays) * (r.hoursPerWeek / 5);
  const workedHoursPerYear = Math.max(paidHoursPerYear - nonWorkingHours, 1);
  return (r.hourlyRate * paidHoursPerYear) / workedHoursPerYear;
}

// Same default the server used to pick on its own: today for a change to
// an existing rate, or far enough back to cover someone's whole
// timesheet history for their first-ever rate. Now just a starting
// point — admin can override it in the date field.
function defaultEffectiveFrom(hasExistingRate: boolean): string {
  return hasExistingRate ? new Date().toISOString().slice(0, 10) : "2020-01-01";
}

export function UsersTable({ users, staffTypes }: { users: UserRow[]; staffTypes: StaffType[] }) {
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);

  return (
    <div>
      {revealedPassword && (
        <TempPasswordReveal
          password={revealedPassword}
          onDismiss={() => setRevealedPassword(null)}
        />
      )}
      <LedgerTable
        headers={[
          "Name",
          "Role",
          "Pages",
          "Default app",
          "Active",
          "Pay rate",
          "",
        ]}
        align={["left", "left", "left", "left", "left", "left", "right"]}
      >
        {users.map((u) => (
          <UserRowItem key={u.id} user={u} staffTypes={staffTypes} onPasswordRevealed={setRevealedPassword} />
        ))}
      </LedgerTable>
    </div>
  );
}

function UserRowItem({
  user,
  staffTypes,
  onPasswordRevealed,
}: {
  user: UserRow;
  staffTypes: StaffType[];
  onPasswordRevealed: (password: string) => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const staffType = staffTypes.find((t) => t.id === user.staff_type_id)?.name;
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [rate, setRate] = useState<RateForm>(() => toRateForm(user.payRate ?? DEFAULT_PAY_RATE));
  const [effectiveFrom, setEffectiveFrom] = useState(() => defaultEffectiveFrom(!!user.payRate));
  const [rateError, setRateError] = useState<string | null>(null);
  const access = user.user_app_access;
  const isAdmin = user.role === "admin";
  const [pagesOpen, setPagesOpen] = useState(false);
  const pageOn = (key: PageKey) => !!access?.[key];
  const pagesOn = ALL_PAGES.filter((p) => pageOn(p.key));

  function togglePage(key: PageKey, granted: boolean) {
    if (key === "measures" || key === "costing") return toggleMc(key, granted);
    if (key === "sales_authority") return toggleAuthority(granted);
    toggleAccess(key, granted);
  }

  function toggleAccess(app: AccessApp, granted: boolean) {
    startTransition(async () => {
      await updateAccessAction(user.id, app, granted);
    });
  }

  function changeDefaultApp(app: DefaultApp) {
    startTransition(async () => {
      await updateDefaultAppAction(user.id, app);
    });
  }

  function changeRole(role: Role) {
    startTransition(async () => {
      await updateRoleAction(user.id, role);
    });
  }

  function toggleActive() {
    startTransition(async () => {
      await updateActiveAction(user.id, !user.is_active);
    });
  }

  function toggleMc(app: "measures" | "costing", granted: boolean) {
    startTransition(async () => {
      await updateMcAccessAction(user.id, app, granted);
    });
  }

  function toggleAuthority(granted: boolean) {
    startTransition(async () => {
      await updateSalesAuthorityAction(user.id, granted);
    });
  }

  function resetPassword() {
    startTransition(async () => {
      const result = await resetPasswordAction(user.id);
      if (result.tempPassword) onPasswordRevealed(result.tempPassword);
    });
  }

  function handleDeleteClick() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    startTransition(async () => {
      await deleteUserAction(user.id);
    });
  }

  function saveRate() {
    setRateError(null);
    const values = fromRateForm(rate);
    if (values.hourlyRate <= 0) return setRateError("Enter the hourly rate.");
    if (values.employmentType === "employee" && values.hoursPerWeek <= 0)
      return setRateError("Enter the hours per week.");
    startTransition(async () => {
      const result = await updateHourlyRateAction(user.id, { ...values, effectiveFrom });
      if (result?.error) {
        setRateError(result.error);
        return;
      }
      setRateOpen(false);
    });
  }

  return (
    <Fragment>
      <tr className={user.is_active ? undefined : "opacity-50"}>
        <td className="py-2 text-ink">
          <div className="font-medium">
            {user.full_name}
            {staffType && <span className="font-normal text-ink-soft"> · {staffType}</span>}
          </div>
          <div className="text-sm text-ink-soft">{user.email}</div>
          {user.pending && user.is_active && (
            <div className="text-xs text-amber-700">Invited - hasn&apos;t signed in yet</div>
          )}
        </td>
        <td className="py-2 pl-4">
          <select
            value={user.role}
            disabled={isPending}
            onChange={(e) => changeRole(e.target.value as Role)}
            className="rounded border border-line bg-paper-raised px-2 py-1 text-sm"
          >
            <option value="admin">Admin</option>
            <option value="supervisor">Supervisor</option>
            <option value="painter">Painter</option>
            <option value="sales">Sales</option>
          </select>
        </td>
        <td className="py-2 pl-4">
          <button
            type="button"
            onClick={() => setPagesOpen((v) => !v)}
            className="text-left text-sm"
          >
            <span className="block max-w-56 truncate text-ink">
              {isAdmin ? "Everything (admin)" : pagesOn.length === 0 ? "No pages" : pagesOn.map((p) => p.label).join(", ")}
            </span>
            <span className="font-medium text-accent hover:text-accent-hover">{pagesOpen ? "Close" : "Choose pages"}</span>
          </button>
        </td>
        <td className="py-2 pl-4">
          <select
            value={access?.default_app ?? "timesheets"}
            disabled={isPending}
            onChange={(e) => changeDefaultApp(e.target.value as DefaultApp)}
            className="rounded border border-line bg-paper-raised px-2 py-1 text-sm"
          >
            {DEFAULT_APP_OPTIONS.filter((o) => defaultAppAllowed(o.value, user.role, access)).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </td>
        <td className="py-2 pl-4">
          <button
            type="button"
            disabled={isPending}
            onClick={toggleActive}
            className="text-sm font-medium text-ink-soft hover:text-ink"
          >
            {user.is_active ? "Deactivate" : "Reactivate"}
          </button>
        </td>
        <td className="py-2 pl-4">
          <button
            type="button"
            onClick={() => {
              setRate(toRateForm(user.payRate ?? DEFAULT_PAY_RATE));
              setEffectiveFrom(defaultEffectiveFrom(!!user.payRate));
              setRateError(null);
              setRateOpen((v) => !v);
            }}
            className="text-sm font-medium whitespace-nowrap text-accent hover:text-accent-hover"
          >
            {user.payRate ? "Edit" : "Set rate"}
          </button>
        </td>
        <td className="py-2 pl-4 text-right whitespace-nowrap">
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="text-sm font-medium whitespace-nowrap text-accent hover:text-accent-hover"
            >
              {moreOpen ? "Close" : "More"}
            </button>
            <button
              type="button"
              onClick={() => setPasswordOpen((v) => !v)}
              className="text-sm font-medium whitespace-nowrap text-accent hover:text-accent-hover"
            >
              {passwordOpen ? "Close" : "Set password"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={resetPassword}
              title="Makes up a temporary password and shows it to you"
              className="text-sm font-medium whitespace-nowrap text-accent hover:text-accent-hover"
            >
              Temporary password
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleDeleteClick}
              style={{ color: overBudgetColor }}
              className="text-sm font-medium whitespace-nowrap hover:underline"
            >
              {confirmingDelete ? "Confirm delete" : "Delete"}
            </button>
          </div>
        </td>
      </tr>
      {pagesOpen && (
        <tr>
          <td colSpan={14} className="bg-background p-4">
            <p className="mb-1 text-sm font-semibold text-ink">Pages {user.full_name} can see and open</p>
            {isAdmin && (
              <p className="mb-2 text-xs text-ink-soft">Admins can open every page. &quot;My sales&quot; and &quot;Team sales&quot; still decide whether they appear on the Sales tracker.</p>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              {PAGE_GROUPS.map((g) => (
                <fieldset key={g.title}>
                  <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">{g.title}</legend>
                  <div className="flex flex-col gap-1">
                    {g.pages.map((p) => {
                      // Admins have everything except the two sales-tracker choices.
                      const locked = isAdmin && p.key !== "sales" && p.key !== "sales_authority";
                      return (
                        <label key={p.key} className="flex min-h-9 items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={locked ? true : pageOn(p.key)}
                            disabled={isPending || locked}
                            onChange={(e) => togglePage(p.key, e.target.checked)}
                          />
                          {p.label}
                          {p.hint && <span className="text-xs text-ink-soft">({p.hint})</span>}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </td>
        </tr>
      )}
      {passwordOpen && (
        <tr>
          <td colSpan={14} className="bg-background p-4">
            <p className="mb-2 text-sm font-semibold text-ink">{user.full_name}</p>
            <SetPasswordForm staffId={user.id} />
          </td>
        </tr>
      )}
      {moreOpen && (
        <tr>
          <td colSpan={14} className="bg-background p-4">
            <UserMore user={user} staffTypes={staffTypes} />
          </td>
        </tr>
      )}
      {rateOpen && (
        <tr>
          <td colSpan={12} className="bg-background p-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Pay rate — admin only, never shown outside this page
            </div>
            <p className="mb-2 text-xs text-ink-soft">
              This doesn&rsquo;t overwrite their current rate — it&rsquo;s saved as a new one
              starting from &ldquo;Effective from,&rdquo; pre-filled to today (or their full
              history, if they&rsquo;ve never had a rate). Change the date to backdate it.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Type
                <select
                  value={rate.employmentType}
                  onChange={(e) =>
                    setRate({ ...rate, employmentType: e.target.value as RateForm["employmentType"] })
                  }
                  className="rounded border border-line bg-paper-raised px-2 py-1.5"
                >
                  <option value="employee">Employee</option>
                  <option value="contractor">Contractor</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Hourly rate ($)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={rate.hourlyRate}
                  onChange={(e) => setRate({ ...rate, hourlyRate: e.target.value })}
                  inputMode="decimal"
                  className="no-spinner w-28 rounded border border-line px-2 py-1.5"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Effective from
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="rounded border border-line px-2 py-1.5"
                />
              </label>
              {rate.employmentType === "employee" && (
                <>
                  <label className="flex flex-col gap-1 text-sm">
                    Hours / week
                    <input
                      type="number"
                      min={1}
                      step="0.5"
                      value={rate.hoursPerWeek}
                      onChange={(e) => setRate({ ...rate, hoursPerWeek: e.target.value })}
                      inputMode="decimal"
                      className="no-spinner w-24 rounded border border-line px-2 py-1.5"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Annual leave (wks/yr)
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={rate.annualLeaveWeeks}
                      onChange={(e) => setRate({ ...rate, annualLeaveWeeks: e.target.value })}
                      inputMode="decimal"
                      className="no-spinner w-24 rounded border border-line px-2 py-1.5"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Sick leave (days/yr)
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={rate.sickLeaveDays}
                      onChange={(e) => setRate({ ...rate, sickLeaveDays: e.target.value })}
                      inputMode="decimal"
                      className="no-spinner w-24 rounded border border-line px-2 py-1.5"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Public holidays (days/yr)
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={rate.publicHolidays}
                      onChange={(e) => setRate({ ...rate, publicHolidays: e.target.value })}
                      inputMode="decimal"
                      className="no-spinner w-24 rounded border border-line px-2 py-1.5"
                    />
                  </label>
                </>
              )}
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-ink-faint">Effective cost / hr worked</span>
                <span className="py-1.5 font-medium text-ink">
                  ${effectiveRate(fromRateForm(rate)).toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                onClick={saveRate}
                disabled={isPending}
                className="rounded bg-ink px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setRateOpen(false)}
                disabled={isPending}
                className="rounded border border-line px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
            {rateError && (
              <p className="mt-2 text-sm" style={{ color: overBudgetColor }}>
                {rateError}
              </p>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}
