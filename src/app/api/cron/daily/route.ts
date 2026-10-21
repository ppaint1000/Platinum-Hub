import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isWorkingDay } from '@/lib/timesheets/email/clockReminders'
import { sendDailyAlerts } from '@/lib/reports/dailyAlerts'
import { emailMonthlyReport, shiftMonth } from '@/lib/reports/monthlyReport'
import { nzTodayDateString } from '@/lib/timesheets/formatNZ'
import { syncXeroInvoices } from '@/lib/xero/invoices'
import { syncXeroBills } from '@/lib/xero/bills'
import { tidyXeroDocuments } from '@/lib/xero/documents'
import { sendRucAlerts } from '@/lib/fleet/rucAlerts'
import { autoSendTimesheets, weeklyBudgetTrend } from '@/lib/automation/weekly'
import { fillMissingBudgets } from '@/lib/quotes/costingBudget'
import { sendTrainingExpiryAlerts } from '@/lib/safety/training'

// Called by Supabase's scheduler (supabase/marketing_and_alerts.sql) at 7am
// NZ time: the daily alerts on working days, and on the 1st last month's
// report. Protected by the 'hub_cron' token (service role only).
function nzMinutes() {
  const parts = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date())
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return get('hour') * 60 + get('minute')
}

export async function POST(request: NextRequest) {
  const db = createAdminClient()
  const provided = request.headers.get('x-cron-token')
  const { data } = await db.from('app_cron_tokens').select('token').eq('name', 'hub_cron').maybeSingle()
  if (!data?.token || !provided || provided !== data.token) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  // Fires at both the summer and winter UTC times - only act at 7am NZ.
  const m = nzMinutes()
  if (m < 6 * 60 + 55 || m >= 7 * 60 + 30) return NextResponse.json({ skipped: 'Not 7am in NZ' })

  const origin = request.nextUrl.origin
  const today = nzTodayDateString()
  const result: Record<string, unknown> = {}

  // Customer invoices and supplier bills from Xero onto their jobs - every day.
  const safely = async (key: string, fn: () => Promise<unknown>) => {
    try {
      result[key] = await fn()
    } catch (e) {
      result[key] = { error: e instanceof Error ? e.message : 'failed' }
    }
  }
  await safely('xeroInvoices', syncXeroInvoices)
  await safely('xeroBills', syncXeroBills)
  // Suppliers' email logos out of Xero's Documents inbox.
  await safely('xeroDocuments', tidyXeroDocuments)
  // Diesels whose road user charges run out within a week (every day).
  await safely('rucAlerts', () => sendRucAlerts(origin))
  // Training (Health & safety) due within 30 days, or expired.
  await safely('trainingExpiry', () => sendTrainingExpiryAlerts(origin))
  // Won jobs priced in Costing with no budget yet get the costing's cost figures.
  await safely('budgetsFromCosting', () => fillMissingBudgets(db))

  // Mondays: last week's timesheets to Xero, and the budget trend - once.
  const isMonday = new Date(`${today}T00:00:00Z`).getUTCDay() === 1
  if (isMonday) {
    const key = `weekly_auto:${today}`
    const { data: ran } = await db.from('hub_alert_log').select('key').eq('key', key).maybeSingle()
    if (!ran) {
      await db.from('hub_alert_log').upsert({ key, detail: 'Monday automation' }, { onConflict: 'key', ignoreDuplicates: true })
      await safely('weeklyTimesheets', () => autoSendTimesheets(origin))
      await safely('weeklyBudget', () => weeklyBudgetTrend(origin))
    }
  }

  if (await isWorkingDay(today)) result.alerts = await sendDailyAlerts(origin)

  if (today.endsWith('-01')) {
    const month = shiftMonth(today.slice(0, 7), -1)
    const key = `monthly_report:${month}`
    const { data: done } = await db.from('hub_alert_log').select('key').eq('key', key).maybeSingle()
    if (!done && (await emailMonthlyReport(month, origin))) {
      await db.from('hub_alert_log').upsert({ key, detail: `Monthly report ${month}` }, { onConflict: 'key', ignoreDuplicates: true })
      result.monthly = month
    }
  }

  return NextResponse.json(result)
}
