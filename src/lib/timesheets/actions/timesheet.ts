'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { requireAdmin } from '@/lib/timesheets/authGuards'
import { getReportEntries } from '@/lib/timesheets/reports'
import { sendTimesheetConfirmationEmail } from '@/lib/timesheets/email/confirmTimesheet'
import { sendClockOutNoteAlert } from '@/lib/timesheets/email/clockReminders'
import { after } from 'next/server'
import { headers } from 'next/headers'

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

// Supervisors (and admins) visiting several sites a day: close the site
// they're on now and start the next one in one go - no lunch question (that's
// asked once, when they clock off for the day). GPS is recorded at the
// switch, and a site's safety plan still has to be acknowledged first time.
export const canSwitchSites = async (role: string) => role === 'supervisor' || role === 'admin'

export async function switchSite(
  input: {
    entryId: string
    siteId: string
    notes?: string
    safetyAcknowledged?: boolean
    deviceId?: string
    deviceLabel?: string
  } & Coords
): Promise<{ error?: string; siteName?: string; at?: string } | undefined> {
  const profile = await getCurrentProfile()
  if (!(await canSwitchSites(profile.role))) return { error: 'Switching sites is for supervisors - clock out, then clock in at the next site.' }
  const supabase = await createClient()

  const { data: current } = await supabase
    .from('timesheet_entries')
    .select('id, site_id, clock_in_at')
    .eq('id', input.entryId)
    .eq('user_id', profile.id)
    .is('clock_out_at', null)
    .maybeSingle()
  if (!current) {
    revalidatePath('/timesheets/clock')
    return { error: "You're not clocked in any more - clock in at the next site." }
  }
  if (current.site_id === input.siteId) return { error: "You're already on that site." }

  const { data: site } = await supabase
    .from('sites')
    .select('name, safety_plan_filename, is_active')
    .eq('id', input.siteId)
    .maybeSingle()
  if (!site?.is_active) return { error: 'That site is no longer open for clocking in.' }

  if (site.safety_plan_filename) {
    const { data: ack } = await supabase
      .from('site_safety_acknowledgements')
      .select('id')
      .eq('user_id', profile.id)
      .eq('site_id', input.siteId)
      .maybeSingle()
    if (!ack) {
      if (!input.safetyAcknowledged) return { error: 'Please confirm you have read the Site Safety Plan for the next site.' }
      const { error: ackError } = await supabase.from('site_safety_acknowledgements').insert({ user_id: profile.id, site_id: input.siteId })
      if (ackError) return { error: ackError.message }
    }
  }

  // One moment for both, so there's no gap or overlap between the two sites.
  const at = new Date().toISOString()
  const notes = input.notes?.trim() || null
  const { data: closed, error: closeError } = await supabase
    .from('timesheet_entries')
    .update({
      clock_out_at: at,
      clock_out_lat: input.lat,
      clock_out_lng: input.lng,
      break_minutes: 0,
      notes,
      clock_out_device_id: input.deviceId ?? null,
      clock_out_device_label: input.deviceLabel ?? null,
    })
    .eq('id', current.id)
    .eq('user_id', profile.id)
    .is('clock_out_at', null)
    .select('id')
  if (closeError) return { error: closeError.message }
  if (!closed?.length) return { error: "Couldn't switch - please try again." }

  const { error: openError } = await supabase.from('timesheet_entries').insert({
    user_id: profile.id,
    site_id: input.siteId,
    clock_in_at: at,
    clock_in_lat: input.lat,
    clock_in_lng: input.lng,
    clock_in_device_id: input.deviceId ?? null,
    clock_in_device_label: input.deviceLabel ?? null,
  })
  if (openError) {
    // Put them back on the site they were on, so they're not left clocked off.
    await supabase
      .from('timesheet_entries')
      .update({ clock_out_at: null, clock_out_lat: null, clock_out_lng: null, clock_out_device_id: null, clock_out_device_label: null })
      .eq('id', current.id)
      .eq('user_id', profile.id)
    revalidatePath('/timesheets/clock')
    return { error: openError.code === '23505' ? "You're already clocked in somewhere else - check My Timesheet." : openError.message }
  }

  if (notes) {
    const h = await headers()
    const origin = h.get('origin') ?? `https://${h.get('host')}`
    after(() => sendClockOutNoteAlert(current.id, origin))
  }

  revalidatePath('/timesheets/clock')
  return { siteName: site.name as string, at }
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

  // A supervisor who switched sites today: the lunch break goes on their
  // longest site visit of the day (it's asked once, at the end).
  let breakEntryId = input.entryId
  // The lunch break can't be longer than the shift itself.
  if (input.breakMinutes > 0) {
    const { data: shift } = await supabase
      .from('timesheet_entries')
      .select('clock_in_at')
      .eq('id', input.entryId)
      .eq('user_id', profile.id)
      .maybeSingle()
    let shiftMinutes = shift ? (new Date(input.clockOutAt).getTime() - new Date(shift.clock_in_at).getTime()) / 60000 : 0
    if (shift && (await canSwitchSites(profile.role))) {
      const visits = await todaysVisits(supabase, profile.id, shift.clock_in_at)
      const minutes = (v: { clock_in_at: string; clock_out_at: string | null }) =>
        (new Date(v.clock_out_at ?? input.clockOutAt).getTime() - new Date(v.clock_in_at).getTime()) / 60000
      const longest = visits.reduce<(typeof visits)[number] | null>((best, v) => (!best || minutes(v) > minutes(best) ? v : best), null)
      if (longest && longest.id !== input.entryId && minutes(longest) > shiftMinutes) {
        breakEntryId = longest.id
        shiftMinutes = minutes(longest)
      }
    }
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
      break_minutes: breakEntryId === input.entryId ? Math.max(0, Math.round(input.breakMinutes)) : 0,
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
  if (breakEntryId !== input.entryId) {
    await supabase
      .from('timesheet_entries')
      .update({ break_minutes: Math.max(0, Math.round(input.breakMinutes)) })
      .eq('id', breakEntryId)
      .eq('user_id', profile.id)
  }

  // Confirm nothing is still running for them (any other shift left open).
  const { count } = await supabase
    .from('timesheet_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .is('clock_out_at', null)

  // A note left at clock-out: let admins and supervisors know (after the
  // response, so clocking out isn't held up by the email).
  if (input.notes.trim()) {
    const h = await headers()
    const origin = h.get('origin') ?? `https://${h.get('host')}`
    after(() => sendClockOutNoteAlert(input.entryId, origin))
  }

  revalidatePath('/timesheets/clock')
  return { clockedOutAt: updated[0].clock_out_at as string, stillRunning: count ?? 0 }
}

// Today's site visits for a supervisor: the chain of shifts back-to-back
// with the one being clocked out (each started when the last ended).
async function todaysVisits(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, lastStart: string) {
  const day = new Date(lastStart).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })
  const { data } = await supabase
    .from('timesheet_entries')
    .select('id, clock_in_at, clock_out_at')
    .eq('user_id', userId)
    .gte('clock_in_at', new Date(Date.parse(lastStart) - 18 * 3600000).toISOString())
    .lte('clock_in_at', lastStart)
    .order('clock_in_at', { ascending: false })
    .returns<{ id: string; clock_in_at: string; clock_out_at: string | null }[]>()
  const rows = (data ?? []).filter((r) => new Date(r.clock_in_at).toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' }) === day)
  // Walk back from the latest while each visit ended exactly when the next began.
  const chain: typeof rows = []
  for (const r of rows) {
    if (!chain.length || r.clock_out_at === chain[chain.length - 1].clock_in_at) chain.push(r)
    else break
  }
  return chain
}
