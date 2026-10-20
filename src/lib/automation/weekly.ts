// Monday 7am (from /api/cron/daily):
//  1. Last week's timesheets to Xero - every finished pay period not yet
//     sent goes as drafts (and onto jobs), then admins get a summary with
//     anything worth a look (no lunch break, rounded days, still clocked on).
//  2. Budget trend - each live job's budget used now against last Monday,
//     emailed when a job is near or over budget or jumped this week.
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/mailer'
import { notificationRecipients } from '@/lib/notifications/recipients'
import { nzTodayDateString } from '@/lib/timesheets/formatNZ'
import { getXeroConnection, xeroCalendars, xeroEmployees } from '@/lib/xero/client'
import { hoursForPeriod, sendPeriod } from '@/lib/xero/timesheets'
import { fetchVariations, groupBy, LIVE_STATUSES, variationTotals } from '@/lib/jobs/jobFinance'

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-NZ')
const nzDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })

export async function autoSendTimesheets(origin: string): Promise<string> {
  const conn = await getXeroConnection()
  if (!conn) return 'Xero not connected'
  const db = createAdminClient()
  const today = nzTodayDateString()
  const [calendars, employees, { data: links }, { data: owner }] = await Promise.all([
    xeroCalendars(),
    xeroEmployees(),
    db.from('xero_employee_links').select('user_id, xero_employee_id'),
    db.from('xero_connection').select('connected_by').eq('id', 1).single(),
  ])
  const calOf = new Map(employees.map((e) => [e.employeeID, e.payrollCalendarID]))
  const lines: string[] = []

  for (const cal of calendars) {
    if (cal.periodEndDate >= today) continue // not finished yet
    const userIds = (links ?? []).filter((l) => calOf.get(l.xero_employee_id as string) === cal.payrollCalendarID).map((l) => l.user_id as string)
    if (!userIds.length) continue
    const r = await sendPeriod({
      calendarId: cal.payrollCalendarID,
      start: cal.periodStartDate,
      end: cal.periodEndDate,
      userIds,
      pushedBy: owner?.connected_by as string,
      skipSent: true,
    })
    if (r.error) {
      lines.push(`${cal.name}: ${r.error}`)
      continue
    }
    const sent = (r.results ?? []).filter((x) => x.ok)
    const failed = (r.results ?? []).filter((x) => !x.ok && !/No hours|Not on this pay calendar/.test(x.message))
    if (!sent.length && !failed.length) continue
    lines.push(`${cal.name}, ${nzDay(cal.periodStartDate)} – ${nzDay(cal.periodEndDate)}:`)
    for (const x of sent) {
      const h = await hoursForPeriod(x.userId, cal.periodStartDate, cal.periodEndDate)
      const flags = [
        h.noLunch.length && `no lunch break ${h.noLunch.map(nzDay).join(', ')}`,
        h.needsCheck.length && `rounded on ${h.needsCheck.length} day(s)`,
        h.openShifts && `${h.openShifts} shift still clocked on (not sent)`,
      ].filter(Boolean)
      lines.push(`  ✓ ${x.name}: ${x.message}${flags.length ? `  ⚠ ${flags.join('; ')}` : ''}`)
    }
    for (const x of failed) lines.push(`  ✕ ${x.name}: ${x.message}`)
  }

  if (!lines.length) return 'nothing to send'
  const to = (await notificationRecipients('weekly_xero_timesheets')).join(', ')
  if (to) {
    await sendEmail({
      to,
      fromName: 'The Hub',
      subject: "Last week's timesheets are in Xero as drafts",
      text:
        `Last week's hours have gone to Xero Payroll as draft timesheets, and onto their jobs:\n\n${lines.join('\n')}\n\n` +
        `Check anything marked ⚠, then approve the timesheets in Xero before the pay run.\n` +
        `Fix a shift and re-send from the Hub: ${origin}/timesheets/admin/xero\n`,
    })
  }
  return lines.join(' | ')
}

export async function weeklyBudgetTrend(origin: string): Promise<string> {
  const db = createAdminClient()
  const week = nzTodayDateString()
  const { data: jobs } = await db
    .from('jobs')
    .select('id, job_number, name')
    .in('status', [...LIVE_STATUSES])
  if (!jobs?.length) return 'no live jobs'
  const ids = jobs.map((j) => j.id as string)
  const [{ data: bva }, variations, { data: prev }] = await Promise.all([
    db.from('job_budget_vs_actual').select('job_id, budgeted_amount, actual_amount').in('job_id', ids),
    fetchVariations(db, ids),
    db.from('job_budget_snapshots').select('job_id, week, budget, actual').in('job_id', ids).lt('week', week).order('week', { ascending: false }),
  ])
  const byJob = groupBy(bva ?? [], (r) => r.job_id as string)
  const varsBy = groupBy(variations, (v) => v.job_id)
  const lastOf = new Map<string, { budget: number; actual: number }>()
  for (const p of prev ?? []) if (!lastOf.has(p.job_id as string)) lastOf.set(p.job_id as string, { budget: Number(p.budget), actual: Number(p.actual) })

  const flagged: string[] = []
  const snapshots = []
  for (const j of jobs) {
    const rows = byJob.get(j.id as string) ?? []
    const budget = rows.reduce((s, r) => s + Number(r.budgeted_amount), 0) + variationTotals(varsBy.get(j.id as string) ?? []).approvedBudget
    const actual = rows.reduce((s, r) => s + Number(r.actual_amount), 0)
    if (budget <= 0) continue
    snapshots.push({ job_id: j.id, week, budget, actual })
    const used = actual / budget
    const last = lastOf.get(j.id as string)
    const lastUsed = last && last.budget > 0 ? last.actual / last.budget : null
    const jump = lastUsed == null ? 0 : used - lastUsed
    if (used >= 0.8 || jump >= 0.15) {
      flagged.push(
        `• ${j.job_number ?? ''} ${j.name}: ${Math.round(used * 100)}% of budget used (${money(actual)} of ${money(budget)})` +
          (lastUsed != null ? `, was ${Math.round(lastUsed * 100)}% last week` : '') +
          (used > 1 ? ' - OVER BUDGET' : '') +
          `\n  ${origin}/jobs/${j.id}`
      )
    }
  }
  if (snapshots.length) await db.from('job_budget_snapshots').upsert(snapshots, { onConflict: 'job_id,week' })
  if (!flagged.length) return 'no jobs to flag'

  const to = (await notificationRecipients('weekly_budget_trend')).join(', ')
  if (to) {
    await sendEmail({
      to,
      fromName: 'The Hub',
      subject: `Budget check: ${flagged.length} job${flagged.length === 1 ? '' : 's'} to watch`,
      text:
        `Live jobs at 80% or more of their budget, or that used 15% or more of it this week:\n\n${flagged.join('\n\n')}\n\n` +
        `All live jobs: ${origin}/jobs/live\n`,
    })
  }
  return `${flagged.length} flagged`
}
