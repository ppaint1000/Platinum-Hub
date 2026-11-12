'use server'

// Timesheets → Xero payroll. Admins only.
import { revalidatePath } from 'next/cache'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { disconnectXero } from '@/lib/xero/client'
import { sendPeriod, type SendResult } from '@/lib/xero/timesheets'

async function admin() {
  const profile = await getCurrentProfile()
  if (profile.role !== 'admin') throw new Error('Admins only.')
  return profile
}

// Save who's who; with `renameToXero`, matched people also take their Xero
// name in the Hub (Xero's is the payroll-correct spelling). Everything is
// linked by person, not name, so their history stays with them.
export async function saveEmployeeLinksAction(
  links: { userId: string; xeroEmployeeId: string | null; xeroName: string | null; rateId?: string | null; rateName?: string | null }[],
  renameToXero = false
) {
  await admin()
  const db = createAdminClient()
  if (renameToXero) {
    for (const l of links.filter((x) => x.xeroEmployeeId && x.xeroName?.trim())) {
      const { error } = await db.from('profiles').update({ full_name: l.xeroName!.trim() }).eq('id', l.userId)
      if (error) return { error: error.message }
    }
  }
  const keep = links.filter((l) => l.xeroEmployeeId)
  const clear = links.filter((l) => !l.xeroEmployeeId).map((l) => l.userId)
  if (keep.length) {
    const { error } = await db.from('xero_employee_links').upsert(
      keep.map((l) => ({
        user_id: l.userId,
        xero_employee_id: l.xeroEmployeeId,
        xero_name: l.xeroName,
        earnings_rate_id: l.rateId || null,
        earnings_rate_name: l.rateId ? l.rateName ?? null : null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id' }
    )
    if (error) return { error: error.message }
  }
  if (clear.length) await db.from('xero_employee_links').delete().in('user_id', clear)
  // Names show all over the Hub.
  revalidatePath(renameToXero ? '/' : '/timesheets/admin/xero', renameToXero ? 'layout' : 'page')
  return {}
}

export async function setEarningsRateAction(id: string, name: string) {
  await admin()
  const { error } = await createAdminClient()
    .from('xero_connection')
    .update({ earnings_rate_id: id || null, earnings_rate_name: name || null, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { error: error.message }
  revalidatePath('/timesheets/admin/xero')
  return {}
}

export async function sendTimesheetsAction(input: {
  calendarId: string
  start: string
  end: string
  userIds: string[]
}): Promise<{ error?: string; results?: SendResult[] }> {
  const profile = await admin()
  const r = await sendPeriod({ ...input, pushedBy: profile.id })
  revalidatePath('/timesheets/admin/xero')
  // Shifts were approved onto jobs too.
  revalidatePath('/jobs', 'layout')
  return r
}

export async function disconnectXeroAction() {
  await admin()
  await disconnectXero()
  revalidatePath('/timesheets/admin/xero')
}

// Staff timesheet photos for a week, from the office Gmail, as a
// "Week ending DD-MM-YYYY" folder (zipped). Stored privately in Supabase
// Storage and handed back as a 10-minute download link - too big to send
// straight back from the server.
export async function timesheetPhotosAction(
  weekEnding: string
): Promise<{ error?: string; url?: string; folder?: string; files?: string[]; people?: string[] }> {
  await admin()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekEnding) || new Date(`${weekEnding}T00:00:00Z`).getUTCDay() !== 0) {
    return { error: 'Pick a week ending (a Sunday).' }
  }
  try {
    const { collectTimesheetPhotos } = await import('@/lib/timesheets/timesheetPhotos')
    const r = await collectTimesheetPhotos(weekEnding)
    if (!r.files.length) return { folder: r.folder, files: [], people: [] }
    const db = createAdminClient()
    const BUCKET = 'timesheet-photos'
    const { error: bucketError } = await db.storage.getBucket(BUCKET)
    if (bucketError) await db.storage.createBucket(BUCKET, { public: false })
    const path = `${weekEnding}/${Date.now()}.zip`
    const { error: upError } = await db.storage.from(BUCKET).upload(path, r.zip, { contentType: 'application/zip', upsert: true })
    if (upError) return { error: `Couldn't store the folder: ${upError.message}` }
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 600, { download: `${r.folder}.zip` })
    if (error || !data) return { error: error?.message ?? "Couldn't make the download link." }
    return { url: data.signedUrl, folder: r.folder, files: r.files, people: r.people }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Something went wrong.'
    return {
      error: /auth|login|credentials|invalid/i.test(msg)
        ? "Gmail wouldn't let the Hub sign in to read email - check the Gmail app password in Vercel (GMAIL_APP_PASSWORD)."
        : msg,
    }
  }
}
