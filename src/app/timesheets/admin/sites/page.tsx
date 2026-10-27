import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { setSiteActive } from '@/lib/timesheets/actions/sites'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { DeleteSiteButton } from './DeleteSiteButton'
import { ensureClockSitesForInProgressJobs } from '@/lib/timesheets/ensureClockSites'
import { createAdminClient } from '@/lib/supabase/admin'

type SiteRow = {
  id: string
  name: string
  address: string | null
  is_active: boolean
  created_at: string
  extent_of_work_filename: string | null
  safety_plan_filename: string | null
  customers: { name: string } | { name: string }[] | null
  entryCount: number
  extraDocuments: { id: string; name: string }[]
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export default async function SitesPage() {
  const profile = await getCurrentProfile()
  const canEdit = profile.role === 'admin'

  // In progress jobs always have an active site - add/restore any missing.
  await ensureClockSitesForInProgressJobs()

  const supabase = await createClient()
  const [{ data: sites }, { data: entryRows }, { data: extraDocRows }, { data: quoteJobs }] =
    await Promise.all([
      supabase
        .from('sites')
        .select(
          'id, name, address, is_active, created_at, job_id, extent_of_work_filename, safety_plan_filename, customers:clients(name)'
        )
        .order('is_active', { ascending: false })
        .order('name', { ascending: true }),
      supabase.from('timesheet_entries').select('site_id, clock_in_at'),
      supabase.from('site_documents').select('id, site_id, name').order('created_at'),
      // Jobs RLS is admin-only, so read just which jobs are still quotes.
      createAdminClient()
        .from('jobs')
        .select('id')
        .in('status', ['draft', 'quoted', 'lost'])
        .returns<{ id: string }[]>(),
    ])

  // Only won-onwards work has a site here - hide any left on quotes.
  const quoteJobIds = new Set((quoteJobs ?? []).map((j) => j.id))

  const entryCounts = new Map<string, number>()
  const lastClockIn = new Map<string, string>()
  for (const row of entryRows ?? []) {
    entryCounts.set(row.site_id, (entryCounts.get(row.site_id) ?? 0) + 1)
    const prev = lastClockIn.get(row.site_id)
    if (row.clock_in_at && (!prev || row.clock_in_at > prev)) lastClockIn.set(row.site_id, row.clock_in_at)
  }

  const extraDocsBySite = new Map<string, { id: string; name: string }[]>()
  for (const doc of extraDocRows ?? []) {
    const list = extraDocsBySite.get(doc.site_id) ?? []
    list.push({ id: doc.id, name: doc.name })
    extraDocsBySite.set(doc.site_id, list)
  }

  const siteList = (sites ?? [])
    .filter((s) => !s.job_id || !quoteJobIds.has(s.job_id))
    .map((s) => ({
    ...s,
    entryCount: entryCounts.get(s.id) ?? 0,
    extraDocuments: extraDocsBySite.get(s.id) ?? [],
  })) as SiteRow[]
  // Active sites: those clocked into in the last 30 days come first, most
  // recent clock-in at the top; the rest follow, newest added first.
  const recentSince = daysAgoIso(30)
  const recentClockIn = (id: string) => {
    const last = lastClockIn.get(id)
    return last && last >= recentSince ? last : null
  }
  const active = siteList
    .filter((s) => s.is_active)
    .sort((a, b) => {
      const ra = recentClockIn(a.id)
      const rb = recentClockIn(b.id)
      if (ra && rb) return rb.localeCompare(ra)
      if (ra) return -1
      if (rb) return 1
      return (b.created_at ?? '').localeCompare(a.created_at ?? '')
    })
  const archived = siteList.filter((s) => !s.is_active)

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Sites</h1>
        <p className="text-sm text-black/60">
          Each site is the clock-in site for a job, under the same client as the job. Painters can only clock in against active sites.
        </p>
      </div>

      <div className="rounded-lg border border-black/10 p-4 text-sm text-black/70">
        Sites are created with their job - add a new job in{' '}
        <Link href="/jobs" className="font-medium underline">
          Jobs
        </Link>{' '}
        and its site appears here, ready for clock-in once the job is In progress. Open a site below to add
        its address, contact and documents.
      </div>

      <SiteList title="Active sites" sites={active} emptyText="No active sites yet." canEdit={canEdit} />
      {archived.length > 0 && (
        <SiteList title="Archived sites" sites={archived} emptyText="" canEdit={canEdit} />
      )}
    </div>
  )
}

function SiteList({
  title,
  sites,
  emptyText,
  canEdit,
}: {
  title: string
  sites: SiteRow[]
  emptyText: string
  canEdit: boolean
}) {
  return (
    <div className="space-y-3">
      <h2 className="font-medium">{title}</h2>
      {sites.length === 0 && <p className="text-sm text-black/60">{emptyText}</p>}
      <ul className="divide-y divide-black/10 rounded-lg border border-black/10">
        {sites.map((site) => {
          const customer = Array.isArray(site.customers) ? site.customers[0] : site.customers
          return (
            <li key={site.id} className="flex items-center justify-between gap-4 p-3">
              <div>
                <Link href={`/timesheets/admin/sites/${site.id}`} className="font-medium underline">
                  {site.name}
                </Link>
                <p className="text-sm text-black/60">
                  {customer?.name ?? 'Unknown customer'}
                  {site.address ? ` — ${site.address}` : ''}
                </p>
                {(site.extent_of_work_filename ||
                  site.safety_plan_filename ||
                  site.extraDocuments.length > 0) && (
                  <p className="mt-1 flex flex-wrap gap-2 text-xs">
                    {site.extent_of_work_filename && (
                      <a
                        href={`/api/timesheets/site-documents/${site.id}/extent-of-work`}
                        target="_blank"
                        className="rounded bg-black/5 px-2 py-0.5 underline"
                      >
                        Extent of Work
                      </a>
                    )}
                    {site.safety_plan_filename && (
                      <a
                        href={`/api/timesheets/site-documents/${site.id}/safety-plan`}
                        target="_blank"
                        className="rounded bg-black/5 px-2 py-0.5 underline"
                      >
                        Safety Plan
                      </a>
                    )}
                    {site.extraDocuments.map((doc) => (
                      <a
                        key={doc.id}
                        href={`/api/timesheets/site-documents/doc/${doc.id}`}
                        target="_blank"
                        className="rounded bg-black/5 px-2 py-0.5 underline"
                      >
                        {doc.name}
                      </a>
                    ))}
                  </p>
                )}
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-3">
                  <form action={setSiteActive.bind(null, site.id, !site.is_active)}>
                    <button type="submit" className="text-sm underline">
                      {site.is_active ? 'Archive' : 'Restore'}
                    </button>
                  </form>
                  {!site.is_active && site.entryCount === 0 && (
                    <DeleteSiteButton siteId={site.id} />
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
