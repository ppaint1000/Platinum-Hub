import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { HubTopBar } from '@/components/dashboard/HubTopBar'
import { Watermark } from '@/components/timesheets/Watermark'
import { MyJobs } from '@/components/schedule/MyJobs'
import { ClockWidget } from './clock-widget'

type CustomerRelation = { name: string } | { name: string }[] | null

type SiteRow = {
  id: string
  name: string
  extent_of_work_filename: string | null
  safety_plan_filename: string | null
  customers: CustomerRelation
  jobs: JobRelation
}

// The site's job, and its work order from the Costing app if it has one.
type JobRelation =
  | { status: string; work_order_url: string | null }
  | { status: string; work_order_url: string | null }[]
  | null

function workOrderUrl(relation: JobRelation): string | null {
  return (Array.isArray(relation) ? relation[0]?.work_order_url : relation?.work_order_url) ?? null
}

type OpenEntrySite = {
  id: string
  name: string
  extent_of_work_filename: string | null
  safety_plan_filename: string | null
  customers: CustomerRelation
}

type OpenEntryRow = {
  id: string
  clock_in_at: string
  sites: OpenEntrySite | OpenEntrySite[] | null
}

const pillClass =
  'rounded-lg bg-gray-300 px-3 py-1.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-400'

export default async function ClockPage() {
  const profile = await getCurrentProfile()
  const supabase = await createClient()
  // Jobs tables are admin-only RLS in the Hub, so a painter's own session
  // can't read job status at all — the admin client is only used here to
  // resolve which sites are clockable, never to expose job financials.
  const admin = createAdminClient()

  // Painters land here, not the Hub, so anyone with Fleet access gets a
  // direct "Log fuel" button rather than having to find it via Hub -> Fleet.
  const { data: appAccess } = await supabase
    .from('user_app_access')
    .select('fleet')
    .eq('user_id', profile.id)
    .maybeSingle<{ fleet: boolean }>()
  const canLogFuel = profile.role === 'admin' || !!appAccess?.fleet

  const [{ data: siteRows }, { data: openEntryRow }, { data: acknowledgements }, { data: extraDocRows }] =
    await Promise.all([
      admin
        .from('sites')
        .select(
          'id, name, extent_of_work_filename, safety_plan_filename, customers:clients(name), jobs!inner(status, work_order_url)'
        )
        .eq('is_active', true)
        .eq('jobs.status', 'in_progress')
        .order('name')
        .returns<SiteRow[]>(),
      supabase
        .from('timesheet_entries')
        .select(
          'id, clock_in_at, sites(id, name, extent_of_work_filename, safety_plan_filename, customers:clients(name))'
        )
        .eq('user_id', profile.id)
        .is('clock_out_at', null)
        .maybeSingle<OpenEntryRow>(),
      supabase
        .from('site_safety_acknowledgements')
        .select('site_id')
        .eq('user_id', profile.id),
      supabase.from('site_documents').select('id, site_id, name').order('created_at'),
    ])

  const acknowledgedSiteIds = new Set((acknowledgements ?? []).map((a) => a.site_id as string))

  const extraDocsBySite = new Map<string, { id: string; name: string }[]>()
  for (const doc of extraDocRows ?? []) {
    const list = extraDocsBySite.get(doc.site_id) ?? []
    list.push({ id: doc.id, name: doc.name })
    extraDocsBySite.set(doc.site_id, list)
  }

  const workOrderBySite = new Map((siteRows ?? []).map((s) => [s.id, workOrderUrl(s.jobs)]))

  const sites = (siteRows ?? []).map((s) => ({
    id: s.id,
    workOrderUrl: workOrderBySite.get(s.id) ?? null,
    // Just the site - painters don't need to see the customer.
    label: s.name,
    hasExtentOfWork: Boolean(s.extent_of_work_filename),
    hasSafetyPlan: Boolean(s.safety_plan_filename),
    safetyAcknowledged: acknowledgedSiteIds.has(s.id),
    extraDocuments: extraDocsBySite.get(s.id) ?? [],
  }))

  const openEntrySite = openEntryRow?.sites
    ? Array.isArray(openEntryRow.sites)
      ? openEntryRow.sites[0]
      : openEntryRow.sites
    : null

  const openEntry = openEntryRow
    ? {
        id: openEntryRow.id,
        clock_in_at: openEntryRow.clock_in_at,
        site_id: openEntrySite?.id ?? null,
        site_name: openEntrySite?.name ?? 'Site',
        workOrderUrl: openEntrySite ? (workOrderBySite.get(openEntrySite.id) ?? null) : null,
        hasExtentOfWork: Boolean(openEntrySite?.extent_of_work_filename),
        hasSafetyPlan: Boolean(openEntrySite?.safety_plan_filename),
        extraDocuments: openEntrySite ? (extraDocsBySite.get(openEntrySite.id) ?? []) : [],
      }
    : null

  return (
    <>
      <HubTopBar activeHref="/timesheets/clock" />
      <main className="relative flex flex-1 flex-col items-center justify-center gap-6 p-4">
        <Watermark />
        <p className="text-sm text-black/60">Signed in as {profile.full_name}</p>
        <ClockWidget sites={sites} openEntry={openEntry} />
        {/* Quick links for the phone - the menu above has the rest. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link href="/timesheets/timesheet" className={pillClass}>
            My Timesheet
          </Link>
          <Link href="/timesheets/timesheet/weekly" className={pillClass}>
            Weekly Timesheet
          </Link>
          <Link href="/timesheets/timesheet/requests" className={pillClass}>
            Request a Change
          </Link>
          {canLogFuel && (
            <Link href="/fleet/log" className={pillClass}>
              Log fuel
            </Link>
          )}
        </div>
        <MyJobs myName={profile.full_name} />
      </main>
    </>
  )
}
