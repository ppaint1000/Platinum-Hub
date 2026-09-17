"use client";

import { Fragment, useState, useTransition } from "react";
import {
  updateAccessAction,
  updateDefaultAppAction,
  updateRoleAction,
  updateActiveAction,
  updateSalesAuthorityAction,
  updateHourlyRateAction,
  resetPasswordAction,
  deleteUserAction,
} from "@/app/users/actions";
import type { AccessApp, DefaultApp, Role } from "@/lib/users/access";
import { LedgerTable } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { TempPasswordReveal } from "./TempPasswordReveal";

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
  } | null;
  payRate: PayRate | null;
};

const APPS: { key: AccessApp; label: string }[] = [
  { key: "timesheets", label: "Timesheets" },
  { key: "fleet", label: "Fleet" },
  { key: "orders", label: "Orders" },
  { key: "jobs", label: "Jobs" },
  { key: "sales", label: "Sales" },
];

const DEFAULT_APP_OPTIONS: { value: DefaultApp; label: string }[] = [
  { value: "hub", label: "Hub" },
  { value: "timesheets", label: "Timesheets" },
  { value: "fleet", label: "Fleet" },
  { value: "orders", label: "Orders" },
  { value: "jobs", label: "Jobs" },
  { value: "sales", label: "Sales" },
];

const DEFAULT_PAY_RATE: PayRate = {
  employmentType: "employee",
  hourlyRate: 0,
  hoursPerWeek: 40,
  annualLeaveWeeks: 4,
  sickLeaveDays: 10,
  publicHolidays: 12,
};

function effectiveRate(r: PayRate): number {
  if (r.employmentType === "contractor") return r.hourlyRate;
  const paidHoursPerYear = r.hoursPerWeek * 52;
  const nonWorkingHours =
    r.annualLeaveWeeks * r.hoursPerWeek + (r.sickLeaveDays + r.publicHolidays) * (r.hoursPerWeek / 5);
  const workedHoursPerYear = Math.max(paidHoursPerYear - nonWorkingHours, 1);
  return (r.hourlyRate * paidHoursPerYear) / workedHoursPerYear;
}

export function UsersTable({ users }: { users: UserRow[] }) {
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
          "Timesheets",
          "Fleet",
          "Orders",
          "Jobs",
          "Sales",
          "Authority",
          "Default app",
          "Active",
          "Pay rate",
          "",
        ]}
      >
        {users.map((u) => (
          <UserRowItem key={u.id} user={u} onPasswordRevealed={setRevealedPassword} />
        ))}
      </LedgerTable>
    </div>
  );
}

function UserRowItem({
  user,
  onPasswordRevealed,
}: {
  user: UserRow;
  onPasswordRevealed: (password: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [rate, setRate] = useState<PayRate>(user.payRate ?? DEFAULT_PAY_RATE);
  const [rateError, setRateError] = useState<string | null>(null);
  const access = user.user_app_access;
  const isAdmin = user.role === "admin";

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
    startTransition(async () => {
      const result = await updateHourlyRateAction(user.id, {
        employmentType: rate.employmentType,
        hourlyRate: Number(rate.hourlyRate),
        hoursPerWeek: Number(rate.hoursPerWeek),
        annualLeaveWeeks: Number(rate.annualLeaveWeeks),
        sickLeaveDays: Number(rate.sickLeaveDays),
        publicHolidays: Number(rate.publicHolidays),
      });
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
          <div className="font-medium">{user.full_name}</div>
          <div className="text-sm text-ink-soft">{user.email}</div>
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
        {APPS.map(({ key }) => {
          // Admins already have full access to every app regardless of
          // these flags, so the other checkboxes are locked to "on" and
          // uneditable for them. Sales is the exception: it also decides
          // whether this person gets their own card on the Sales tracker
          // page, which an admin may or may not want independently of
          // their access level - so it stays real and editable for admins.
          const forcedOnForAdmin = isAdmin && key !== "sales";
          return (
            <td key={key} className="py-2 pl-4 text-center">
              <input
                type="checkbox"
                checked={forcedOnForAdmin ? true : !!access?.[key]}
                disabled={isPending || forcedOnForAdmin}
                onChange={(e) => toggleAccess(key, e.target.checked)}
              />
            </td>
          );
        })}
        <td className="py-2 pl-4 text-center">
          <input
            type="checkbox"
            checked={!!access?.sales_authority}
            disabled={isPending}
            onChange={(e) => toggleAuthority(e.target.checked)}
          />
        </td>
        <td className="py-2 pl-4">
          <select
            value={access?.default_app ?? "timesheets"}
            disabled={isPending}
            onChange={(e) => changeDefaultApp(e.target.value as DefaultApp)}
            className="rounded border border-line bg-paper-raised px-2 py-1 text-sm"
          >
            {DEFAULT_APP_OPTIONS.filter((o) =>
              o.value === "hub"
                ? isAdmin || !!access?.fleet || !!access?.orders || !!access?.jobs || !!access?.sales
                : isAdmin || !!access?.[o.value as AccessApp]
            ).map((o) => (
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
              setRate(user.payRate ?? DEFAULT_PAY_RATE);
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
              disabled={isPending}
              onClick={resetPassword}
              className="text-sm font-medium whitespace-nowrap text-accent hover:text-accent-hover"
            >
              Reset password
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
      {rateOpen && (
        <tr>
          <td colSpan={12} className="bg-background p-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Pay rate — admin only, never shown outside this page
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                Type
                <select
                  value={rate.employmentType}
                  onChange={(e) =>
                    setRate({ ...rate, employmentType: e.target.value as PayRate["employmentType"] })
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
                  onChange={(e) => setRate({ ...rate, hourlyRate: Number(e.target.value) })}
                  className="w-28 rounded border border-line px-2 py-1.5"
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
                      onChange={(e) => setRate({ ...rate, hoursPerWeek: Number(e.target.value) })}
                      className="w-24 rounded border border-line px-2 py-1.5"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Annual leave (wks/yr)
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={rate.annualLeaveWeeks}
                      onChange={(e) => setRate({ ...rate, annualLeaveWeeks: Number(e.target.value) })}
                      className="w-24 rounded border border-line px-2 py-1.5"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Sick leave (days/yr)
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={rate.sickLeaveDays}
                      onChange={(e) => setRate({ ...rate, sickLeaveDays: Number(e.target.value) })}
                      className="w-24 rounded border border-line px-2 py-1.5"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Public holidays (days/yr)
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={rate.publicHolidays}
                      onChange={(e) => setRate({ ...rate, publicHolidays: Number(e.target.value) })}
                      className="w-24 rounded border border-line px-2 py-1.5"
                    />
                  </label>
                </>
              )}
              <div className="flex flex-col gap-1 text-sm">
                <span className="text-ink-faint">Effective cost / hr worked</span>
                <span className="py-1.5 font-medium text-ink">
                  ${effectiveRate(rate).toFixed(2)}
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
