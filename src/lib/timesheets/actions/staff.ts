'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, requireAdminOrSupervisor } from '@/lib/timesheets/authGuards'
import { sendAuthEmail } from '@/lib/timesheets/email/authEmails'
import { SITE_URL } from '@/lib/timesheets/siteUrl'
import type { Role } from '@/lib/supabase/profile'

const VALID_ROLES: Role[] = ['admin', 'supervisor', 'painter']

export type InviteStaffState = { error?: string; success?: string } | undefined

export async function inviteStaff(
  _prevState: InviteStaffState,
  formData: FormData
): Promise<InviteStaffState> {
  const caller = await requireAdminOrSupervisor()

  const email = formData.get('email')
  const full_name = formData.get('full_name')
  const submittedRole = formData.get('role')
  const password = formData.get('password')

  if (typeof email !== 'string' || !email.trim()) {
    return { error: 'Email is required.' }
  }
  if (typeof full_name !== 'string' || !full_name.trim()) {
    return { error: 'Name is required.' }
  }
  if (typeof password === 'string' && password && password.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }

  // The Role dropdown offers admin/supervisor/painter plus every active
  // staff type (Contractor, Apprentice, etc.) as a single merged list.
  // Picking a staff type still only ever grants Painter-level access - it's
  // a job classification, not a permission. Supervisors can only ever
  // create Painter accounts, regardless of what the form submits.
  let role: Role = 'painter'
  let staffTypeId: string | null = null

  if (caller.role !== 'supervisor' && typeof submittedRole === 'string') {
    if (VALID_ROLES.includes(submittedRole as Role)) {
      role = submittedRole as Role
    } else if (submittedRole) {
      const supabase = await createClient()
      const { data: staffType } = await supabase
        .from('staff_types')
        .select('id')
        .eq('id', submittedRole)
        .eq('is_active', true)
        .maybeSingle()
      if (staffType) staffTypeId = staffType.id
    }
  }

  let userId: string | undefined

  // Setting a password directly skips the invite email entirely - useful
  // while email delivery is unreliable (or just to hand someone their
  // login on the spot). They can log in immediately with what's set here.
  if (typeof password === 'string' && password) {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim() },
    })
    if (error) return { error: error.message }
    userId = data.user?.id
  } else {
    const { error, userId: invitedId } = await sendAuthEmail(email.trim(), 'invite', full_name.trim())
    if (error) return { error }
    userId = invitedId
  }

  if ((role !== 'painter' || staffTypeId) && userId) {
    const supabase = await createClient()
    const update: { role?: Role; staff_type_id?: string | null } = {}
    if (role !== 'painter') update.role = role
    if (staffTypeId) update.staff_type_id = staffTypeId
    await supabase.from('profiles').update(update).eq('id', userId)
  }

  revalidatePath('/timesheets/admin/staff')

  if (typeof password === 'string' && password) {
    return {
      success: `Account created. Have them sign in at ${SITE_URL}/login with ${email.trim()} and the password you set.`,
    }
  }

  redirect('/timesheets/admin/staff')
}

export async function updateStaff(staffId: string, formData: FormData) {
  await requireAdmin()

  const full_name = formData.get('full_name')
  const submittedRole = formData.get('role')

  if (typeof full_name !== 'string' || !full_name.trim()) return

  const supabase = await createClient()

  // Same merged Role dropdown as invite: admin/supervisor/painter, or an
  // active staff type id (which always resolves to Painter-level access).
  let role: Role = 'painter'
  let staffTypeId: string | null = null
  if (typeof submittedRole === 'string') {
    if (VALID_ROLES.includes(submittedRole as Role)) {
      role = submittedRole as Role
    } else if (submittedRole) {
      const { data: staffType } = await supabase
        .from('staff_types')
        .select('id')
        .eq('id', submittedRole)
        .eq('is_active', true)
        .maybeSingle()
      if (staffType) staffTypeId = staffType.id
    }
  }

  await supabase
    .from('profiles')
    .update({
      full_name: full_name.trim(),
      role,
      staff_type_id: staffTypeId,
    })
    .eq('id', staffId)

  revalidatePath('/timesheets/admin/staff')
  redirect('/timesheets/admin/staff')
}

export type EmailActionState = { success?: boolean; error?: string } | undefined

export async function sendPasswordReset(
  staffId: string,
  _prevState: EmailActionState,
  _formData: FormData
): Promise<EmailActionState> {
  await requireAdmin()

  const supabase = await createClient()
  const { data: person } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', staffId)
    .single()

  if (!person) return { error: 'Staff member not found.' }

  const { error } = await sendAuthEmail(person.email, 'recovery')

  if (error) return { error }
  return { success: true }
}

// A "resend" for someone who never finished setting up their account is the
// same underlying email as a password reset - it re-sends a fresh link they
// can use to set a password and sign in for the first time.
export async function resendInvite(
  staffId: string,
  _prevState: EmailActionState,
  _formData: FormData
): Promise<EmailActionState> {
  await requireAdminOrSupervisor()

  const supabase = await createClient()
  const { data: person } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', staffId)
    .single()

  if (!person) return { error: 'Staff member not found.' }

  const { error } = await sendAuthEmail(person.email, 'recovery')

  if (error) return { error }
  return { success: true }
}

export async function setStaffPassword(
  staffId: string,
  _prevState: EmailActionState,
  formData: FormData
): Promise<EmailActionState> {
  await requireAdmin()

  const password = formData.get('password')
  if (typeof password !== 'string' || password.length < 8) {
    return { error: 'Password must be at least 8 characters.' }
  }

  // email_confirm is included so this always works in one step even if the
  // person never clicked a working invite/reset link before - otherwise
  // Supabase silently keeps blocking sign-in on the unconfirmed email even
  // after a password is set, which looks identical to a wrong password.
  const adminClient = createAdminClient()
  const { error } = await adminClient.auth.admin.updateUserById(staffId, {
    password,
    email_confirm: true,
  })

  if (error) return { error: error.message }
  return { success: true }
}

// Deactivating (rather than deleting) keeps the person's past timesheet
// entries intact for historical reports - a hard delete would cascade and
// wipe them. The Supabase Auth ban is what actually blocks their login;
// is_active just drives what the staff list shows.
export async function setStaffActive(staffId: string, isActive: boolean) {
  const caller = await requireAdmin()
  if (staffId === caller.id) return

  const supabase = await createClient()
  await supabase.from('profiles').update({ is_active: isActive }).eq('id', staffId)

  const adminClient = createAdminClient()
  await adminClient.auth.admin.updateUserById(staffId, {
    ban_duration: isActive ? 'none' : '876000h',
  })

  revalidatePath('/timesheets/admin/staff')
}

// Only for deactivated staff with zero timesheet entries - anyone who's
// actually logged hours needs to stay (deleting the auth user cascades and
// would wipe their history), which is exactly what deactivating protects.
export async function deleteStaff(staffId: string) {
  const caller = await requireAdmin()
  if (staffId === caller.id) return

  const supabase = await createClient()
  const { count } = await supabase
    .from('timesheet_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', staffId)

  if ((count ?? 0) > 0) return

  const adminClient = createAdminClient()
  await adminClient.auth.admin.deleteUser(staffId)

  revalidatePath('/timesheets/admin/staff')
}
