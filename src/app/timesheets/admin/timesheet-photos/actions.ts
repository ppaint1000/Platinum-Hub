'use server'

// Timesheets → Timesheet Photos. Admins only.
import { getCurrentProfile } from '@/lib/supabase/profile'
import { createAdminClient } from '@/lib/supabase/admin'

// Staff timesheet photos for a week, from the office Gmail, as a
// "Week ending DD-MM-YYYY" folder (zipped). Stored privately in Supabase
// Storage and handed back as a 10-minute download link - too big to send
// straight back from the server.
export async function timesheetPhotosAction(
  weekEnding: string
): Promise<{ error?: string; url?: string; folder?: string; files?: string[]; people?: string[] }> {
  const profile = await getCurrentProfile()
  if (profile.role !== 'admin') return { error: 'Admins only.' }
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
