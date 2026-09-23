'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/timesheets/authGuards'

// Where to land after saving/deleting - the Reports edit link and the
// Staff > Timesheet edit link both point here, and each wants to come back
// to itself rather than always landing on Reports. Only ever a path within
// this app (never an arbitrary redirect target from form input).
function resolveReturnTo(formData: FormData): string {
  const returnTo = formData.get('return_to')
  return typeof returnTo === 'string' && returnTo.startsWith('/timesheets/')
    ? returnTo
    : '/timesheets/admin/reports'
}

export async function updateEntry(entryId: string, formData: FormData) {
  await requireAdmin()

  const siteId = formData.get('site_id')
  const clockInLocal = formData.get('clock_in_at')
  const clockOutLocal = formData.get('clock_out_at')
  const breakMinutesRaw = formData.get('break_minutes')
  const notes = formData.get('notes')
  const returnTo = resolveReturnTo(formData)

  if (typeof siteId !== 'string' || !siteId) return
  if (typeof clockInLocal !== 'string' || !clockInLocal) return

  const clockIn = new Date(clockInLocal)
  const clockOut =
    typeof clockOutLocal === 'string' && clockOutLocal ? new Date(clockOutLocal) : null
  const breakMinutes =
    typeof breakMinutesRaw === 'string' ? Math.max(0, parseInt(breakMinutesRaw, 10) || 0) : 0

  const supabase = await createClient()
  await supabase
    .from('timesheet_entries')
    .update({
      site_id: siteId,
      clock_in_at: clockIn.toISOString(),
      clock_out_at: clockOut ? clockOut.toISOString() : null,
      break_minutes: breakMinutes,
      notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    })
    .eq('id', entryId)

  revalidatePath(returnTo)
  redirect(returnTo)
}

export async function deleteEntry(entryId: string, formData: FormData) {
  await requireAdmin()
  const returnTo = resolveReturnTo(formData)

  const supabase = await createClient()
  await supabase.from('timesheet_entries').delete().eq('id', entryId)

  revalidatePath(returnTo)
  redirect(returnTo)
}
