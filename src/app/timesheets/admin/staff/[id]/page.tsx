import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateStaff, sendPasswordReset, setStaffActive } from '@/lib/timesheets/actions/staff'
import { requireAdmin } from '@/lib/timesheets/authGuards'
import { EmailActionButton } from '../email-action-button'
import { SetPasswordForm } from '../set-password-form'

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const caller = await requireAdmin()

  const { id } = await params
  const supabase = await createClient()
  const [{ data: person }, { data: staffTypes }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, role, is_active, staff_type_id')
      .eq('id', id)
      .single(),
    supabase.from('staff_types').select('id, name').eq('is_active', true).order('name'),
  ])

  if (!person) {
    notFound()
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Edit staff</h1>
      <p className="text-sm text-black/60">{person.email}</p>
      <Link href={`/timesheets/admin/staff/${person.id}/timesheet`} className="text-sm underline">
        View timesheet
      </Link>

      <form action={updateStaff.bind(null, person.id)} className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="full_name" className="text-sm font-medium">
            Full name
          </label>
          <input
            id="full_name"
            name="full_name"
            defaultValue={person.full_name}
            required
            className="w-full rounded-md border border-black/20 px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="role" className="text-sm font-medium">
            Role
          </label>
          <select
            id="role"
            name="role"
            defaultValue={person.staff_type_id ?? person.role}
            className="w-full rounded-md border border-black/20 px-3 py-2 sm:w-auto"
          >
            <option value="painter">Painter</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option>
            {(staffTypes ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
        >
          Save changes
        </button>
      </form>

      <EmailActionButton
        action={sendPasswordReset.bind(null, person.id)}
        label="Send password reset email"
        pendingLabel="Sending…"
        successMessage="Email sent."
      />

      <SetPasswordForm staffId={person.id} />

      {person.id !== caller.id && (
        <form action={setStaffActive.bind(null, person.id, !person.is_active)}>
          <button type="submit" className="text-sm underline text-red-600">
            {person.is_active ? 'Deactivate staff member' : 'Restore staff member'}
          </button>
        </form>
      )}
      {!person.is_active && (
        <p className="text-sm text-black/60">
          Deactivated - can no longer sign in. Their past timesheets are unaffected.
        </p>
      )}
    </div>
  )
}
