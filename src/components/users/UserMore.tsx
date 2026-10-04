"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateUserDetailsAction } from "@/app/users/actions";
import { resendInvite, sendPasswordReset } from "@/lib/timesheets/actions/staff";
import { EmailActionButton } from "@/app/timesheets/admin/staff/email-action-button";
import { SetPasswordForm } from "@/app/timesheets/admin/staff/set-password-form";

export type StaffType = { id: string; name: string };

// The rest of managing someone (what used to be on Timesheets → Staff):
// name, staff type, emailing them an invite or password-reset link,
// setting a password, and their timesheet.
export function UserMore({
  user,
  staffTypes,
}: {
  user: { id: string; full_name: string; staff_type_id: string | null; pending: boolean; is_active: boolean };
  staffTypes: StaffType[];
}) {
  const [name, setName] = useState(user.full_name);
  const [staffType, setStaffType] = useState(user.staff_type_id ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const changed = name.trim() !== user.full_name || (staffType || null) !== user.staff_type_id;

  function save() {
    setMessage(null);
    startSaving(async () => {
      const result = await updateUserDetailsAction(user.id, { fullName: name, staffTypeId: staffType || null });
      setMessage(result?.error ? { ok: false, text: result.error } : { ok: true, text: "Saved." });
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-56 rounded border border-line bg-paper-raised px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Staff type
            <select
              value={staffType}
              onChange={(e) => setStaffType(e.target.value)}
              className="rounded border border-line bg-paper-raised px-2 py-1.5"
            >
              <option value="">None</option>
              {staffTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={save}
            disabled={saving || !changed}
            className="rounded bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</p>}
        <p className="text-xs text-ink-soft">
          Staff types are a job classification (e.g. Apprentice) - set them up in{" "}
          <Link href="/timesheets/admin/staff-types" className="underline">
            Settings → Staff types
          </Link>
          .
        </p>

        <div className="flex flex-wrap items-start gap-5">
          {user.pending && user.is_active ? (
            <EmailActionButton
              action={resendInvite.bind(null, user.id)}
              label="Email their invite again"
              pendingLabel="Sending…"
              successMessage="Invite sent."
            />
          ) : (
            <EmailActionButton
              action={sendPasswordReset.bind(null, user.id)}
              label="Email a password-reset link"
              pendingLabel="Sending…"
              successMessage="Email sent."
            />
          )}
          <Link href={`/timesheets/admin/staff/${user.id}/timesheet`} className="text-sm underline">
            View their timesheet
          </Link>
        </div>
      </div>

      <SetPasswordForm staffId={user.id} />
    </div>
  );
}
