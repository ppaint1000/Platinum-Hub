'use client'

import { useActionState, useState } from 'react'
import { inviteStaff } from '@/lib/timesheets/actions/staff'
import type { Role } from '@/lib/supabase/profile'

type StaffType = { id: string; name: string }

export function InviteStaffForm({ role, staffTypes }: { role: Role; staffTypes: StaffType[] }) {
  const [state, action, pending] = useActionState(inviteStaff, undefined)
  const [setPasswordNow, setSetPasswordNow] = useState(false)
  const canChooseRole = role === 'admin'

  return (
    <form action={action} className="space-y-3 rounded-lg border border-black/10 p-4">
      <h2 className="font-medium">Add a staff member</h2>
      <p className="text-sm text-black/60">
        {setPasswordNow
          ? "You'll set their password now and can hand it to them directly - no email sent."
          : "They'll get an email to set their own password."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="full_name" className="text-sm font-medium">
            Full name
          </label>
          <input
            id="full_name"
            name="full_name"
            required
            className="w-full rounded-md border border-black/20 px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-md border border-black/20 px-3 py-2"
          />
        </div>
      </div>
      {canChooseRole ? (
        <div className="space-y-1">
          <label htmlFor="role" className="text-sm font-medium">
            Role
          </label>
          <select
            id="role"
            name="role"
            defaultValue="painter"
            className="w-full rounded-md border border-black/20 px-3 py-2 sm:w-auto"
          >
            <option value="painter">Painter</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option>
            {staffTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-sm text-black/60">Role: Painter</p>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={setPasswordNow}
          onChange={(e) => setSetPasswordNow(e.target.checked)}
        />
        Set their password myself instead of emailing an invite
      </label>

      {setPasswordNow && (
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={8}
            required={setPasswordNow}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className="w-full rounded-md border border-black/20 px-3 py-2"
          />
        </div>
      )}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : setPasswordNow ? 'Create account' : 'Send invite'}
      </button>
    </form>
  )
}
