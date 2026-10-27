import { createAdminClient } from '@/lib/supabase/admin'

// A job and its clock-in site are meant to be the same thing: every job that
// is In progress must have an active site so painters can clock in to it.
// The jobs_site_on_win trigger only creates a site on some status changes
// (e.g. not for a job already Won/Scheduled before the trigger existed), and
// a site can be archived while its job is still running. This closes both
// gaps: any In progress job with no site gets one named after the job, and
// any In progress job whose sites are all archived has its newest one
// restored. Safe to call on every load - it does nothing when all is well.
export async function ensureClockSitesForInProgressJobs() {
  const admin = createAdminClient()

  const { data: jobs } = await admin
    .from('jobs')
    .select('id, name, client_id')
    .eq('status', 'in_progress')
    .returns<{ id: string; name: string; client_id: string | null }[]>()
  if (!jobs?.length) return

  const { data: sites } = await admin
    .from('sites')
    .select('id, job_id, is_active, created_at')
    .in(
      'job_id',
      jobs.map((j) => j.id)
    )
    .order('created_at', { ascending: false })
    .returns<{ id: string; job_id: string; is_active: boolean; created_at: string }[]>()

  const sitesByJob = new Map<string, { id: string; is_active: boolean }[]>()
  for (const s of sites ?? []) {
    const list = sitesByJob.get(s.job_id) ?? []
    list.push(s)
    sitesByJob.set(s.job_id, list)
  }

  const toCreate: { name: string; client_id: string | null; job_id: string; is_active: boolean }[] = []
  const toRestore: string[] = []
  for (const job of jobs) {
    const jobSites = sitesByJob.get(job.id) ?? []
    if (jobSites.length === 0) {
      toCreate.push({ name: job.name, client_id: job.client_id, job_id: job.id, is_active: true })
    } else if (!jobSites.some((s) => s.is_active)) {
      // Newest first (ordered above), so this restores the latest site.
      toRestore.push(jobSites[0].id)
    }
  }

  if (toCreate.length) await admin.from('sites').insert(toCreate)
  if (toRestore.length) await admin.from('sites').update({ is_active: true }).in('id', toRestore)
}
