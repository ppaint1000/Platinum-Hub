"use client";

import { useState } from "react";
import { createUserAction } from "@/app/users/actions";
import { defaultAccessForRole, type AccessApp, type DefaultApp, type Role } from "@/lib/users/access";
import { Button, Panel } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { TempPasswordReveal } from "./TempPasswordReveal";

const APPS: { key: AccessApp; label: string }[] = [
  { key: "timesheets", label: "Timesheets" },
  { key: "fleet", label: "Fleet" },
  { key: "orders", label: "Orders" },
  { key: "jobs", label: "Jobs" },
  { key: "sales", label: "Sales" },
];

const APP_LABEL: Record<DefaultApp, string> = {
  hub: "Hub",
  timesheets: "Timesheets",
  fleet: "Fleet",
  orders: "Orders",
  jobs: "Jobs",
  sales: "Sales",
};

export function NewUserForm() {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("painter");
  const [access, setAccess] = useState<Record<AccessApp, boolean>>(defaultAccessForRole("painter"));
  const [defaultApp, setDefaultApp] = useState<DefaultApp>("timesheets");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  function changeRole(next: Role) {
    setRole(next);
    setAccess(defaultAccessForRole(next));
    setDefaultApp(next === "painter" ? "timesheets" : "hub");
  }

  function toggleApp(app: AccessApp, checked: boolean) {
    setAccess((prev) => ({ ...prev, [app]: checked }));
    if (!checked && defaultApp === app) {
      setDefaultApp("hub");
    }
  }

  function resetForm() {
    setFullName("");
    setEmail("");
    changeRole("painter");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await createUserAction({ fullName, email, role, access, defaultApp });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.tempPassword) setTempPassword(result.tempPassword);
    resetForm();
    setOpen(false);
  }

  const defaultAppOptions = (Object.keys(APP_LABEL) as DefaultApp[]).filter((o) =>
    role === "admin"
      ? true
      : o === "hub"
        ? access.fleet || access.orders || access.jobs || access.sales
        : access[o as AccessApp]
  );

  return (
    <div className="relative">
      {tempPassword && (
        <div className="absolute right-0 top-0 z-10 w-96">
          <TempPasswordReveal password={tempPassword} onDismiss={() => setTempPassword(null)} />
        </div>
      )}

      {!open ? (
        <Button onClick={() => setOpen(true)}>Add user</Button>
      ) : (
        <Panel className="absolute right-0 top-0 z-10 w-96 p-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <label className="block text-sm font-medium text-ink">Full name</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Email</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Role</label>
              <select
                value={role}
                onChange={(e) => changeRole(e.target.value as Role)}
                className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
              >
                <option value="admin">Admin</option>
                <option value="supervisor">Supervisor</option>
                <option value="painter">Painter</option>
                <option value="sales">Sales</option>
              </select>
            </div>
            <div>
              <span className="block text-sm font-medium text-ink">Access</span>
              <div className="mt-1 flex flex-wrap gap-3">
                {APPS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-1.5 text-sm text-ink-soft">
                    <input
                      type="checkbox"
                      checked={role === "admin" ? true : access[key]}
                      disabled={role === "admin"}
                      onChange={(e) => toggleApp(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink">Default app</label>
              <select
                value={defaultApp}
                onChange={(e) => setDefaultApp(e.target.value as DefaultApp)}
                className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
              >
                {defaultAppOptions.map((o) => (
                  <option key={o} value={o}>
                    {APP_LABEL[o]}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <p className="text-sm" style={{ color: overBudgetColor }}>
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create user"}
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </div>
  );
}
