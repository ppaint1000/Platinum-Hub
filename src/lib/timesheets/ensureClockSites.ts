import { createAdminClient } from '@/lib/supabase/admin'

// A job and its clock-in site are the same thing, but only once the job is
// real work: quotes don't get a site. From Won onwards (Won, Scheduled,
// In progress) every job with a client has a site named after it, and an
// In progress job's site is always active so painters can clock in to it.
// Covers jobs from any source (Costing, Add job, the old Quotes app) and
// sites archived while their job is still running. Safe to call on every
// load - it does nothing when all is well.
const SITE_STATUSES = ['won', 'scheduled', 'in_progress']

export async function ensureClockSitesForInProgressJobs() {
  const admin = createAdminClient()

  const { data: jobs } = await admin
    .from('jobs')
    .select('id, name, client_id, status')
    .in('status', SITE_STATUSES)
    .returns<{ id: string; name: string; client_id: string | null; status: string }[]>()
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

  const toCreate: { name: string; client_id: string; job_id: string; is_active: boolean }[] = []
  const toRestore: string[] = []
  for (const job of jobs) {
    const jobSites = sitesByJob.get(job.id) ?? []
    if (jobSites.length === 0) {
      // Sites must belong to a client - a job with no client gets its site
      // once a client is set on it.
      if (!job.client_id) continue
      toCreate.push({ name: job.name, client_id: job.client_id, job_id: job.id, is_active: true })
    } else if (job.status === 'in_progress' && !jobSites.some((s) => s.is_active)) {
      // Newest first (ordered above), so this restores the latest site.
      toRestore.push(jobSites[0].id)
    }
  }

  if (toCreate.length) await admin.from('sites').insert(toCreate)
  if (toRestore.length) await admin.from('sites').update({ is_active: true }).in('id', toRestore)
}
