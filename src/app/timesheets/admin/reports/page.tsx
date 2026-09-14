import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getReportEntries } from '@/lib/timesheets/reports'
import { groupByDayAndStaff, groupByDayAndSite } from '@/lib/timesheets/reportGroups'
import { requireAdmin } from '@/lib/timesheets/authGuards'
import { formatNZDateTime } from '@/lib/timesheets/formatNZ'
import { WeeklyReportPanel } from './weekly-report-panel'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requireAdmin()

  const sp = await searchParams
  const from = typeof sp.from === 'string' ? sp.from : ''
  const to = typeof sp.to === 'string' ? sp.to : ''
  const userId = typeof sp.userId === 'string' ? sp.userId : ''
  const siteId = typeof sp.siteId === 'string' ? sp.siteId : ''

  const supabase = await createClient()
  const [{ data: crew }, { data: sites }, entries, { data: settings }, dailySiteTotals, dailyStaffTotals] =
    await Promise.all([
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase.from('sites').select('id, name').order('name'),
      getReportEntries({ from, to, userId, siteId }),
      supabase.from('app_settings').select('weekly_report_enabled').eq('id', true).single(),
      siteId ? groupByDayAndStaff({ from, to, userId, siteId }) : Promise.resolve([]),
      userId ? groupByDayAndSite({ from, to, userId, siteId }) : Promise.resolve([]),
    ])

  const selectedSiteName = siteId ? (sites ?? []).find((s) => s.id === siteId)?.name : undefined
  const selectedStaffName = userId ? (crew ?? []).find((c) => c.id === userId)?.full_name : undefined

  const totalHours = entries.reduce((sum, e) => sum + (e.hours ?? 0), 0)

  const exportParams = new URLSearchParams()
  if (from) exportParams.set('from', from)
  if (to) exportParams.set('to', to)
  if (userId) exportParams.set('userId', userId)
  if (siteId) exportParams.set('siteId', siteId)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-black/60">
            {entries.length} entries · {totalHours.toFixed(2)} total hours
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/timesheets/reports/export?${exportParams.toString()}`}
            className="rounded-md bg-black px-4 py-2 text-sm text-white"
          >
            Export CSV
          </a>
          <a
            href={`/api/timesheets/reports/export/pdf?${exportParams.toString()}`}
            className="rounded-md border border-black/20 px-4 py-2 text-sm"
          >
            Download PDF
          </a>
          <a
            href={`/api/timesheets/reports/export/xlsx?${exportParams.toString()}`}
            className="rounded-md border border-black/20 px-4 py-2 text-sm"
          >
            Download Excel
          </a>
        </div>
      </div>

      <WeeklyReportPanel enabled={settings?.weekly_report_enabled ?? false} />

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-black/10 p-4">
        <div className="space-y-1">
          <label htmlFor="from" className="text-sm font-medium">
            From
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from}
            className="rounded-md border border-black/20 px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="to" className="text-sm font-medium">
            To
          </label>
          <input
            id="to"
            name="to"
            type="date"
            defaultValue={to}
            className="rounded-md border border-black/20 px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="userId" className="text-sm font-medium">
            Staff
          </label>
          <select
            id="userId"
            name="userId"
            defaultValue={userId}
            className="rounded-md border border-black/20 px-3 py-2"
          >
            <option value="">All staff</option>
            {(crew ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="siteId" className="text-sm font-medium">
            Site
          </label>
          <select
            id="siteId"
            name="siteId"
            defaultValue={siteId}
            className="rounded-md border border-black/20 px-3 py-2"
          >
            <option value="">All sites</option>
            {(sites ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-black/20 px-4 py-2 text-sm"
        >
          Filter
        </button>
      </form>

      {siteId && (
        <div className="space-y-2">
          <h2 className="font-medium">
            Daily hours at {selectedSiteName ?? 'this site'}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-black/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/10 bg-black/5">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Staff</th>
                  <th className="p-3">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {dailySiteTotals.map((row) => (
                  <tr key={`${row.date}__${row.userName}`}>
                    <td className="p-3">{row.date}</td>
                    <td className="p-3">{row.userName}</td>
                    <td className="p-3">{row.hours}</td>
                  </tr>
                ))}
                {dailySiteTotals.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-black/60">
                      No completed shifts at this site in range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {userId && (
        <div className="space-y-2">
          <h2 className="font-medium">
            Daily hours for {selectedStaffName ?? 'this staff member'}
          </h2>
          <div className="overflow-x-auto rounded-lg border border-black/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/10 bg-black/5">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Site</th>
                  <th className="p-3">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10">
                {dailyStaffTotals.map((row) => (
                  <tr key={`${row.date}__${row.siteName}`}>
                    <td className="p-3">{row.date}</td>
                    <td className="p-3">{row.siteName}</td>
                    <td className="p-3">{row.hours}</td>
                  </tr>
                ))}
                {dailyStaffTotals.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-6 text-center text-black/60">
                      No completed shifts for this staff member in range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 bg-black/5">
            <tr>
              <th className="p-3">Staff</th>
              <th className="p-3">Site</th>
              <th className="p-3">Clock in</th>
              <th className="p-3">Clock out</th>
              <th className="p-3">Break</th>
              <th className="p-3">Hours</th>
              <th className="p-3">Device</th>
              <th className="p-3">Notes</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="p-3">{e.user_name}</td>
                <td className="p-3">{e.site_name}</td>
                <td className="p-3">
                  {formatNZDateTime(e.clock_in_at)}
                  {e.clock_in_map_url && (
                    <>
                      {' '}
                      <a href={e.clock_in_map_url} target="_blank" className="text-xs underline">
                        Map
                      </a>
                    </>
                  )}
                </td>
                <td className="p-3">
                  {e.clock_out_at ? formatNZDateTime(e.clock_out_at) : 'In progress'}
                  {e.clock_out_map_url && (
                    <>
                      {' '}
                      <a href={e.clock_out_map_url} target="_blank" className="text-xs underline">
                        Map
                      </a>
                    </>
                  )}
                </td>
                <td className="p-3">{e.break_minutes > 0 ? `${e.break_minutes}m` : '—'}</td>
                <td className="p-3">{e.hours ?? '—'}</td>
                <td className={`p-3 text-xs ${e.device_shared ? 'font-medium text-red-600' : 'text-black/60'}`}>
                  In: {e.clock_in_device_label ?? '—'}
                  {e.clock_out_device_label && e.clock_out_device_label !== e.clock_in_device_label && (
                    <>
                      <br />
                      Out: {e.clock_out_device_label}
                    </>
                  )}
                  {e.device_shared && (
                    <>
                      <br />
                      also used by another staff member
                    </>
                  )}
                </td>
                <td className="max-w-xs truncate p-3">{e.notes ?? ''}</td>
                <td className="p-3">
                  <Link href={`/timesheets/admin/reports/${e.id}/edit`} className="underline">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-black/60">
                  No entries match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
