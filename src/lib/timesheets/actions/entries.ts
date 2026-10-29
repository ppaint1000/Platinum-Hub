'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/timesheets/authGuards'
import { nzLocalToIso } from '@/lib/timesheets/formatNZ'

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

  // The form's times are NZ time (the server's own clock is UTC).
  const clockIn = new Date(nzLocalToIso(clockInLocal))
  const clockOut =
    typeof clockOutLocal === 'string' && clockOutLocal ? new Date(nzLocalToIso(clockOutLocal)) : null
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

// Admin adds a whole shift after the fact (someone forgot to clock in, or
// the phone was flat). Date + start/finish are NZ time. Returns an error
// message for the form to show, or redirects back on success.
export async function addEntry(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string } | undefined> {
  await requireAdmin()

  const userId = formData.get('user_id')
  const siteId = formData.get('site_id')
  const date = formData.get('date')
  const start = formData.get('start')
  const finish = formData.get('finish')
  const breakMinutesRaw = formData.get('break_minutes')
  const notes = formData.get('notes')
  const returnTo = resolveReturnTo(formData)

  if (typeof userId !== 'string' || !userId) return { error: 'Choose who the shift is for.' }
  if (typeof siteId !== 'string' || !siteId) return { error: 'Choose the site/job.' }
  if (typeof date !== 'string' || !date) return { error: 'Choose the date.' }
  if (typeof start !== 'string' || !start || typeof finish !== 'string' || !finish) {
    return { error: 'Enter the start and finish times.' }
  }

  const clockIn = nzLocalToIso(`${date}T${start}`)
  const clockOut = nzLocalToIso(`${date}T${finish}`)
  if (clockOut <= clockIn) return { error: 'Finish time must be after the start time.' }
  if (new Date(clockIn).getTime() > Date.now()) return { error: "That shift hasn't started yet." }

  const breakMinutes =
    typeof breakMinutesRaw === 'string' ? Math.max(0, parseInt(breakMinutesRaw, 10) || 0) : 0

  const supabase = await createClient()

  // Don't double up: refuse if it overlaps one of their existing shifts.
  const { data: overlapping } = await supabase
    .from('timesheet_entries')
    .select('id')
    .eq('user_id', userId)
    .lt('clock_in_at', clockOut)
    .or(`clock_out_at.is.null,clock_out_at.gt.${clockIn}`)
    .limit(1)
  if (overlapping?.length) {
    return { error: 'This overlaps a shift they already have that day - edit that one instead.' }
  }

  const { error } = await supabase.from('timesheet_entries').insert({
    user_id: userId,
    site_id: siteId,
    clock_in_at: clockIn,
    clock_out_at: clockOut,
    break_minutes: breakMinutes,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
  })
  if (error) return { error: error.message }

  revalidatePath('/timesheets/admin/reports')
  revalidatePath(returnTo)
  redirect(returnTo)
}
