import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isWorkingDay } from '@/lib/timesheets/email/clockReminders'
import { sendDailyAlerts } from '@/lib/reports/dailyAlerts'
import { emailMonthlyReport, shiftMonth } from '@/lib/reports/monthlyReport'
import { nzTodayDateString } from '@/lib/timesheets/formatNZ'
import { syncXeroInvoices } from '@/lib/xero/invoices'

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

  // Customer invoices from Xero onto their jobs - every day.
  try {
    result.xeroInvoices = await syncXeroInvoices()
  } catch (e) {
    result.xeroInvoices = { error: e instanceof Error ? e.message : 'failed' }
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
