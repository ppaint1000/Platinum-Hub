'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { requireAdmin } from '@/lib/timesheets/authGuards'
import { nzDateKey } from '@/lib/timesheets/formatNZ'
import { sendChangeRequestEmail } from '@/lib/timesheets/email/changeRequest'

type ActionResult = { error?: string } | undefined
type SiteRelation = { name: string } | { name: string }[] | null

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

// Painters can no longer edit a punch directly (see the removed
// updateTimesheetEntry in actions/timesheet.ts) — this is the only way a
// painter can change a clock in/out time: file a request against one of
// their own entries, which an admin then approves or rejects.
export async function submitChangeRequest(input: {
  entryId: string
  changeStart: boolean
  changeFinish: boolean
  changeSite: boolean
  newStart: string // HH:mm, local
  newFinish: string // HH:mm, local
  newSiteId: string
  note: string
}): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  const supabase = await createClient()

  if (!input.changeStart && !input.changeFinish && !input.changeSite) {
    return { error: 'Choose start time, finish time, site/job, or a combination.' }
  }
  if (!input.note.trim()) {
    return { error: 'Add a comment explaining what needs to change.' }
  }

  const { data: entry } = await supabase
    .from('timesheet_entries')
    .select('id, clock_in_at, clock_out_at, sites(name)')
    .eq('id', input.entryId)
    .eq('user_id', profile.id)
    .maybeSingle()

  if (!entry) return { error: 'Shift not found.' }

  const dateKey = nzDateKey(entry.clock_in_at)

  let requestedClockInAt: string | null = null
  let requestedClockOutAt: string | null = null
  let requestedSiteId: string | null = null

  if (input.changeStart) {
    if (!input.newStart) return { error: 'Enter the corrected start time.' }
    requestedClockInAt = new Date(`${dateKey}T${input.newStart}:00`).toISOString()
  }
  if (input.changeFinish) {
    if (!input.newFinish) return { error: 'Enter the corrected finish time.' }
    requestedClockOutAt = new Date(`${dateKey}T${input.newFinish}:00`).toISOString()
  }
  if (input.changeSite) {
    if (!input.newSiteId) return { error: 'Choose the correct site/job.' }
    requestedSiteId = input.newSiteId
  }

  const { error } = await supabase.from('timesheet_change_requests').insert({
    entry_id: entry.id,
    user_id: profile.id,
    requested_clock_in_at: requestedClockInAt,
    requested_clock_out_at: requestedClockOutAt,
    requested_site_id: requestedSiteId,
    note: input.note.trim() || null,
  })

  if (error) return { error: error.message }

  const site = first(entry.sites as SiteRelation)
  let requestedSiteName: string | null = null
  if (requestedSiteId) {
    const { data: requestedSite } = await supabase
      .from('sites')
      .select('name')
      .eq('id', requestedSiteId)
      .maybeSingle()
    requestedSiteName = requestedSite?.name ?? null
  }

  await sendChangeRequestEmail({
    userName: profile.full_name,
    date: dateKey,
    siteName: site?.name ?? 'Unknown site',
    currentStart: entry.clock_in_at,
    currentFinish: entry.clock_out_at,
    requestedStart: requestedClockInAt,
    requestedFinish: requestedClockOutAt,
    requestedSiteName,
    note: input.note,
  })

  revalidatePath('/timesheets/timesheet/requests')
}

export async function approveChangeRequest(requestId: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()

  const { data: request } = await supabase
    .from('timesheet_change_requests')
    .select('id, entry_id, status, requested_clock_in_at, requested_clock_out_at, requested_site_id')
    .eq('id', requestId)
    .single()

  if (!request) return { error: 'Request not found.' }
  if (request.status !== 'pending') return { error: 'Already resolved.' }

  const patch: { clock_in_at?: string; clock_out_at?: string; site_id?: string } = {}
  if (request.requested_clock_in_at) patch.clock_in_at = request.requested_clock_in_at
  if (request.requested_clock_out_at) patch.clock_out_at = request.requested_clock_out_at
  if (request.requested_site_id) patch.site_id = request.requested_site_id

  const { error: entryError } = await supabase
    .from('timesheet_entries')
    .update(patch)
    .eq('id', request.entry_id)
  if (entryError) return { error: entryError.message }

  const { error } = await supabase
    .from('timesheet_change_requests')
    .update({ status: 'approved', resolved_at: new Date().toISOString(), resolved_by: admin.id })
    .eq('id', requestId)
  if (error) return { error: error.message }

  revalidatePath('/timesheets/admin/change-requests')
  revalidatePath('/timesheets/admin/reports')
  revalidatePath('/timesheets/timesheet/requests')
}

export async function rejectChangeRequest(requestId: string, adminNotes: string): Promise<ActionResult> {
  const admin = await requireAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from('timesheet_change_requests')
    .update({
      status: 'rejected',
      resolved_at: new Date().toISOString(),
      resolved_by: admin.id,
      admin_notes: adminNotes.trim() || null,
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (error) return { error: error.message }

  revalidatePath('/timesheets/admin/change-requests')
  revalidatePath('/timesheets/timesheet/requests')
}
