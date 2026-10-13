// Timesheets → Xero payroll: connect the Hub to Xero, match each person to
// their Xero employee, then send a pay period's hours to Xero Payroll NZ as
// draft timesheets to check and approve in Xero before the pay run.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getXeroConnection,
  xeroCalendars,
  xeroConfigured,
  xeroEarningsRates,
  xeroEmployees,
  type XeroCalendar,
  type XeroEarningsRate,
  type XeroEmployee,
} from '@/lib/xero/client'
import { hoursForPeriod, periodDates, shiftPeriod } from '@/lib/xero/timesheets'
import { XeroPayrollPanel, type PreviewRow } from './xero-panel'
import { disconnectXeroAction } from './actions'

const nzDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })

export default async function XeroPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; calendar?: string; period?: string }>
}) {
  const profile = await getCurrentProfile()
  if (profile.role !== 'admin') redirect('/timesheets/admin')
  const q = await searchParams

  const banner = q.connected ? (
    <p className="rounded-md bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">Connected to {q.connected}.</p>
  ) : q.error ? (
    <p className="rounded-md bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      {q.error === 'not-set-up'
        ? "Xero isn't set up yet - see the steps below."
        : q.error === 'expired'
          ? 'That took too long or was opened twice - please try Connect again.'
          : `Xero said: ${q.error}`}
    </p>
  ) : null

  if (!xeroConfigured()) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Xero payroll</h1>
        {banner}
        <div className="rounded-lg border border-black/10 bg-white p-5 text-sm leading-relaxed">
          <p className="mb-3 font-semibold">One-off setup (about 10 minutes):</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Sign in at <span className="font-mono">developer.xero.com</span> with your Xero login → <b>My Apps</b> → <b>New app</b>.
            </li>
            <li>
              Name <b>Platinum Hub</b>, type <b>Web app</b>, company URL <span className="font-mono">https://platinum-painters-hub.vercel.app</span>, redirect URI{' '}
              <span className="font-mono">https://platinum-painters-hub.vercel.app/api/xero/callback</span>.
            </li>
            <li>
              Copy the app&apos;s <b>Client id</b> and generate a <b>Client secret</b>. In Vercel → the Hub project → Settings → Environment Variables, add{' '}
              <span className="font-mono">XERO_CLIENT_ID</span> and <span className="font-mono">XERO_CLIENT_SECRET</span>, then redeploy.
            </li>
            <li>Come back here and click Connect to Xero.</li>
          </ol>
        </div>
      </div>
    )
  }

  const conn = await getXeroConnection()
  if (!conn) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Xero payroll</h1>
        {banner}
        <p className="text-sm text-black/70">
          Connect the Hub to your Xero organisation. Xero will ask you to choose the organisation and allow the Hub to read employees and pay settings, and add
          timesheets.
        </p>
        <a href="/api/xero/connect" className="inline-block rounded-md bg-[#13B5EA] px-5 py-3 text-sm font-semibold text-white hover:opacity-90">
          Connect to Xero
        </a>
      </div>
    )
  }

  let employees: XeroEmployee[] = []
  let calendars: XeroCalendar[] = []
  let rates: XeroEarningsRate[] = []
  let loadError = ''
  try {
    ;[employees, calendars, rates] = await Promise.all([xeroEmployees(), xeroCalendars(), xeroEarningsRates()])
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Could not reach Xero.'
  }

  const db = createAdminClient()
  const [{ data: access }, { data: links }] = await Promise.all([
    db.from('user_app_access').select('user_id').eq('timesheets', true),
    db.from('xero_employee_links').select('user_id, xero_employee_id, xero_name, earnings_rate_id'),
  ])
  const ids = (access ?? []).map((a) => a.user_id as string)
  const { data: people } = ids.length
    ? await db.from('profiles').select('id, full_name').in('id', ids).eq('is_active', true).is('deleted_at', null).order('full_name')
    : { data: [] as { id: string; full_name: string }[] }
  const staff = (people ?? []).map((p) => ({ id: p.id as string, name: p.full_name as string }))
  const linkOf = new Map((links ?? []).map((l) => [l.user_id as string, l.xero_employee_id as string]))
  const rateOf = Object.fromEntries((links ?? []).filter((l) => l.earnings_rate_id).map((l) => [l.user_id as string, l.earnings_rate_id as string]))

  // The pay calendar: chosen, else the one most linked staff are on.
  const calOf = new Map(employees.map((e) => [e.employeeID, e.payrollCalendarID]))
  const usage = new Map<string, number>()
  for (const id of linkOf.values()) {
    const c = calOf.get(id)
    if (c) usage.set(c, (usage.get(c) ?? 0) + 1)
  }
  const calendar =
    calendars.find((c) => c.payrollCalendarID === q.calendar) ??
    calendars.find((c) => c.payrollCalendarID === [...usage].sort((a, b) => b[1] - a[1])[0]?.[0]) ??
    calendars[0]
  const offset = q.period === 'prev' ? -1 : 0
  const period = calendar ? shiftPeriod(calendar.periodStartDate, calendar.periodEndDate, offset) : null

  let preview: PreviewRow[] = []
  if (calendar && period) {
    const onCalendar = staff.filter((s) => {
      const emp = linkOf.get(s.id)
      return emp && calOf.get(emp) === calendar.payrollCalendarID
    })
    const { data: pushes } = await db
      .from('xero_timesheet_pushes')
      .select('user_id, hours, pushed_at')
      .eq('period_start', period.start)
    const pushedBy = new Map((pushes ?? []).map((p) => [p.user_id as string, p]))
    preview = await Promise.all(
      onCalendar.map(async (s) => {
        const h = await hoursForPeriod(s.id, period.start, period.end)
        const p = pushedBy.get(s.id)
        return {
          userId: s.id,
          name: s.name,
          days: h.days,
          total: h.total,
          needsCheck: h.needsCheck,
          noLunch: h.noLunch,
          openShifts: h.openShifts,
          sent: p ? { hours: Number(p.hours), at: p.pushed_at as string } : null,
        }
      })
    )
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Xero payroll</h1>
          <p className="text-sm text-black/60">
            Connected to <b>{conn.tenant_name}</b>. Hours go to Xero as draft timesheets - check and approve them in Xero before the pay run.
          </p>
        </div>
        <form action={disconnectXeroAction}>
          <button className="text-sm text-black/60 underline hover:text-black">Disconnect Xero</button>
        </form>
      </div>
      {banner}
      {loadError ? (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-semibold">Couldn&apos;t read from Xero: {loadError}</p>
          <p className="mt-1">
            Try <a href="/api/xero/connect" className="font-semibold underline">connecting again</a>.
          </p>
        </div>
      ) : (
        <>
          {calendars.length > 1 && (
            <div className="flex flex-wrap gap-2 text-sm">
              {calendars.map((c) => (
                <Link
                  key={c.payrollCalendarID}
                  href={`/timesheets/admin/xero?calendar=${c.payrollCalendarID}`}
                  className={`rounded-full border px-3 py-1 ${c.payrollCalendarID === calendar?.payrollCalendarID ? 'border-black bg-black text-white' : 'border-black/20'}`}
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}
          {calendar && period && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">
                {calendar.name}: {nzDate(period.start)} – {nzDate(period.end)}
              </span>
              <Link
                href={`/timesheets/admin/xero?calendar=${calendar.payrollCalendarID}${offset === 0 ? '&period=prev' : ''}`}
                className="rounded-full border border-black/20 px-3 py-1 hover:bg-black/5"
              >
                {offset === 0 ? '← Previous pay period' : 'Current pay period →'}
              </Link>
            </div>
          )}
          <XeroPayrollPanel
            staff={staff}
            links={Object.fromEntries(linkOf)}
            personRates={rateOf}
            employees={employees.map((e) => ({ id: e.employeeID, name: `${e.firstName} ${e.lastName}`.trim(), calendarId: e.payrollCalendarID }))}
            rates={rates.map((r) => ({ id: r.earningsRateID, name: r.name, type: r.earningsType }))}
            rateId={conn.earnings_rate_id}
            calendarId={calendar?.payrollCalendarID ?? null}
            period={period}
            dates={period ? periodDates(period.start, period.end) : []}
            preview={preview}
          />
        </>
      )}
    </div>
  )
}
