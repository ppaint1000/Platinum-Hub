'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { requireAdmin } from '@/lib/timesheets/authGuards'
import { getReportEntries } from '@/lib/timesheets/reports'
import { sendTimesheetConfirmationEmail } from '@/lib/timesheets/email/confirmTimesheet'

type Coords = { lat: number | null; lng: number | null }
type ActionResult = { error?: string } | undefined

export async function clockIn(
  input: {
    siteId: string
    safetyAcknowledged?: boolean
    deviceId?: string
    deviceLabel?: string
  } & Coords
): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  const supabase = await createClient()

  const { data: site } = await supabase
    .from('sites')
    .select('safety_plan_filename')
    .eq('id', input.siteId)
    .single()

  if (site?.safety_plan_filename) {
    const { data: ack } = await supabase
      .from('site_safety_acknowledgements')
      .select('id')
      .eq('user_id', profile.id)
      .eq('site_id', input.siteId)
      .maybeSingle()

    if (!ack) {
      if (!input.safetyAcknowledged) {
        return { error: 'Please confirm you have read the Site Safety Plan before clocking in.' }
      }
      const { error: ackError } = await supabase.from('site_safety_acknowledgements').insert({
        user_id: profile.id,
        site_id: input.siteId,
      })
      if (ackError) {
        return { error: ackError.message }
      }
    }
  }

  // Only ever one shift running: clocking in again (a double tap, a second
  // phone) is refused while one is open. The database enforces it too.
  const { data: running } = await supabase
    .from('timesheet_entries')
    .select('id, clock_in_at, sites(name)')
    .eq('user_id', profile.id)
    .is('clock_out_at', null)
    .order('clock_in_at', { ascending: false })
    .limit(1)
  if (running?.length) {
    revalidatePath('/timesheets/clock')
    return { error: "You're already clocked in - clock out of that shift first." }
  }

  const { error } = await supabase.from('timesheet_entries').insert({
    user_id: profile.id,
    site_id: input.siteId,
    clock_in_lat: input.lat,
    clock_in_lng: input.lng,
    clock_in_device_id: input.deviceId ?? null,
    clock_in_device_label: input.deviceLabel ?? null,
  })

  if (error) {
    // The one-open-shift rule in the database (a clock-in from two places at once).
    if (error.code === '23505') {
      revalidatePath('/timesheets/clock')
      return { error: "You're already clocked in - clock out of that shift first." }
    }
    return { error: error.message }
  }

  revalidatePath('/timesheets/clock')
}

// Admin-initiated clock in/out on behalf of a staff member who forgot -
// no GPS (the admin isn't on site) and no safety-plan gate (that's a
// self-confirmation only the person themselves can make).
export async function adminClockIn(userId: string, siteId: string): Promise<ActionResult> {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase.from('timesheet_entries').insert({
    user_id: userId,
    site_id: siteId,
  })

  if (error) {
    if (error.code === '23505') return { error: 'They are already clocked in - clock them out first.' }
    return { error: error.message }
  }

  revalidatePath('/timesheets/admin/activity')
}

export async function adminClockOut(entryId: string): Promise<ActionResult> {
  await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('timesheet_entries')
    .update({ clock_out_at: new Date().toISOString() })
    .eq('id', entryId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/timesheets/admin/activity')
}

// Sends the painter's reviewed week (already-saved punches) to the office
// by email, as a confirmation that the hours are correct.
export async function confirmWeeklyTimesheet(input: { from: string; to: string }): Promise<ActionResult> {
  const profile = await getCurrentProfile()

  const entries = await getReportEntries({ userId: profile.id, from: input.from, to: input.to })

  if (entries.length === 0) {
    return { error: 'No hours recorded for this week yet.' }
  }
  if (entries.some((e) => e.hours === null)) {
    return { error: 'You still have a shift that hasn’t been clocked out. Clock out before confirming.' }
  }

  const result = await sendTimesheetConfirmationEmail({
    userName: profile.full_name,
    from: input.from,
    to: input.to,
    entries,
  })

  if (!result.sent) {
    return { error: result.reason }
  }
}

export async function clockOut(
  input: {
    entryId: string
    notes: string
    breakMinutes: number
    clockOutAt: string
    deviceId?: string
    deviceLabel?: string
  } & Coords
): Promise<{ error?: string; clockedOutAt?: string; stillRunning?: number } | undefined> {
  const profile = await getCurrentProfile()
  const supabase = await createClient()

  // The lunch break can't be longer than the shift itself.
  if (input.breakMinutes > 0) {
    const { data: shift } = await supabase
      .from('timesheet_entries')
      .select('clock_in_at')
      .eq('id', input.entryId)
      .eq('user_id', profile.id)
      .maybeSingle()
    const shiftMinutes = shift ? (new Date(input.clockOutAt).getTime() - new Date(shift.clock_in_at).getTime()) / 60000 : 0
    if (shift && input.breakMinutes >= shiftMinutes) {
      return { error: 'Your lunch break is longer than your shift - check the time.' }
    }
  }

  const { data: updated, error } = await supabase
    .from('timesheet_entries')
    .update({
      clock_out_at: input.clockOutAt,
      clock_out_lat: input.lat,
      clock_out_lng: input.lng,
      break_minutes: Math.max(0, Math.round(input.breakMinutes)),
      notes: input.notes.trim() || null,
      clock_out_device_id: input.deviceId ?? null,
      clock_out_device_label: input.deviceLabel ?? null,
    })
    .eq('id', input.entryId)
    .eq('user_id', profile.id)
    .select('id, clock_out_at')

  if (error) {
    return { error: error.message }
  }
  if (!updated?.length) return { error: "Couldn't clock you out - please try again or tell the office." }

  // Confirm nothing is still running for them (any other shift left open).
  const { count } = await supabase
    .from('timesheet_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .is('clock_out_at', null)

  revalidatePath('/timesheets/clock')
  return { clockedOutAt: updated[0].clock_out_at as string, stillRunning: count ?? 0 }
}
