"use client";

import { useState } from "react";
import { createUserAction } from "@/app/users/actions";
import {
  DEFAULT_APP_OPTIONS,
  defaultAccessForRole,
  defaultAppAllowed,
  defaultAppForRole,
  type AccessApp,
  type DefaultApp,
  type Role,
} from "@/lib/users/access";
import { Button, Panel } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { TempPasswordReveal } from "./TempPasswordReveal";
import type { StaffType } from "./UserMore";

const APPS: { key: AccessApp; label: string }[] = [
  { key: "timesheets", label: "Timesheets" },
  { key: "fleet", label: "Fleet" },
  { key: "orders", label: "Orders" },
  { key: "jobs", label: "Jobs" },
  { key: "sales", label: "Sales" },
  { key: "production", label: "Production board" },
  { key: "schedule", label: "Schedule" },
  { key: "safety", label: "Health & safety" },
];


export function NewUserForm({ staffTypes }: { staffTypes: StaffType[] }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("painter");
  const [access, setAccess] = useState<Record<AccessApp, boolean>>(defaultAccessForRole("painter"));
  const [defaultApp, setDefaultApp] = useState<DefaultApp>(defaultAppForRole("painter"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [staffTypeId, setStaffTypeId] = useState("");
  // Email them a link to set their own password, or show a temporary one.
  const [invite, setInvite] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  function changeRole(next: Role) {
    setRole(next);
    setAccess(defaultAccessForRole(next));
    // Painters start on Clock in, sales on Sales, supervisors on the
    // Production board, admins on the Dashboard - change it below if needed.
    setDefaultApp(defaultAppForRole(next));
  }

  function toggleApp(app: AccessApp, checked: boolean) {
    setAccess((prev) => ({ ...prev, [app]: checked }));
    const next = { ...access, [app]: checked };
    if (!defaultAppAllowed(defaultApp, role, next)) {
      const usual = defaultAppForRole(role);
      setDefaultApp(defaultAppAllowed(usual, role, next) ? usual : "timesheets");
    }
  }

  function resetForm() {
    setFullName("");
    setEmail("");
    setStaffTypeId("");
    changeRole("painter");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    setNotice(null);
    const result = await createUserAction({ fullName, email, role, access, defaultApp, staffTypeId: staffTypeId || null, invite });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.tempPassword) setTempPassword(result.tempPassword);
    else setNotice(`Invite emailed to ${email.trim()} - they set their own password from the link.`);
    resetForm();
    setOpen(false);
  }

  const defaultAppOptions = DEFAULT_APP_OPTIONS.filter((o) => defaultAppAllowed(o.value, role, access));

  return (
    <div className="relative">
      {tempPassword && (
        <div className="absolute right-0 top-0 z-10 w-96">
          <TempPasswordReveal password={tempPassword} onDismiss={() => setTempPassword(null)} />
        </div>
      )}

      {notice && !open && <p className="mb-2 max-w-sm text-sm text-green-700">{notice}</p>}
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
            {staffTypes.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-ink">Staff type</label>
                <select
                  value={staffTypeId}
                  onChange={(e) => setStaffTypeId(e.target.value)}
                  className="mt-1 w-full rounded border border-line px-2 py-1.5 text-sm"
                >
                  <option value="">None</option>
                  {staffTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="block text-sm font-medium text-ink">Signing in</span>
              <label className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
                <input type="radio" checked={invite} onChange={() => setInvite(true)} />
                Email them an invite link to set their own password
              </label>
              <label className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
                <input type="radio" checked={!invite} onChange={() => setInvite(false)} />
                Give me a temporary password to pass on
              </label>
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
