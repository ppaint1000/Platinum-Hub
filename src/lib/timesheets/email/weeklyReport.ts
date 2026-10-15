import { createElement } from 'react'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { ReactElement } from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/mailer'
import { groupByStaffForPayroll } from '@/lib/timesheets/reportGroups'
import { TimesheetReportPdf } from '@/lib/timesheets/pdf/timesheet-report-pdf'
import { timesheetRecipients } from '@/lib/notifications/recipients'

const FROM_NAME = 'Platinum weekly timesheet report'

function nzDateString(date: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(date)
}

// The most recently completed Monday-Sunday week, in NZ time.
export function getPreviousWeekRange(now: Date = new Date()): { from: string; to: string } {
  const today = new Date(`${nzDateString(now)}T00:00:00Z`)
  const dayOfWeek = today.getUTCDay() // 0 = Sunday .. 6 = Saturday

  const lastSunday = new Date(today)
  lastSunday.setUTCDate(today.getUTCDate() - dayOfWeek)

  const lastMonday = new Date(lastSunday)
  lastMonday.setUTCDate(lastSunday.getUTCDate() - 6)

  const toDateStr = (d: Date) => d.toISOString().slice(0, 10)
  return { from: toDateStr(lastMonday), to: toDateStr(lastSunday) }
}

// This week, Monday to Sunday, in NZ time (on a Sunday, the week ending today).
export function getThisWeekRange(now: Date = new Date()): { from: string; to: string } {
  const today = new Date(`${nzDateString(now)}T00:00:00Z`)
  const sinceMonday = (today.getUTCDay() + 6) % 7
  const monday = new Date(today)
  monday.setUTCDate(today.getUTCDate() - sinceMonday)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const toDateStr = (d: Date) => d.toISOString().slice(0, 10)
  return { from: toDateStr(monday), to: toDateStr(sunday) }
}

export async function isWeeklyReportEnabled(): Promise<boolean> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('app_settings')
    .select('weekly_report_enabled')
    .eq('id', true)
    .single()

  return data?.weekly_report_enabled ?? false
}

export type SendWeeklyReportResult = { sent: true } | { sent: false; reason: string }

// week: 'last' (the default - the last complete Mon-Sun week) or 'this'
// (this Monday to Sunday, so far).
export async function sendWeeklyReportEmail(options?: {
  force?: boolean
  week?: 'this' | 'last'
}): Promise<SendWeeklyReportResult> {
  const enabled = await isWeeklyReportEnabled()
  if (!enabled && !options?.force) {
    return { sent: false, reason: 'Weekly report is turned off.' }
  }

  const supabase = createAdminClient()
  const { from, to } = options?.week === 'this' ? getThisWeekRange() : getPreviousWeekRange()
  const { staffGroups, flaggedDates } = await groupByStaffForPayroll({ from, to }, supabase)

  const logoBuffer = await readFile(path.join(process.cwd(), 'public', 'logo.png'))
  const document = createElement(TimesheetReportPdf, {
    staffGroups,
    dateRangeLabel: `${from} to ${to}`,
    logoSrc: { data: logoBuffer, format: 'png' as const },
    flaggedDates,
  }) as ReactElement<DocumentProps>
  const pdfBuffer = await renderToBuffer(document)

  // The timesheet address, plus anyone who's turned this on (Notifications).
  const recipient = await timesheetRecipients('weekly_timesheet_report')

  return sendEmail({
    to: recipient,
    subject: `Weekly timesheet report: ${from} to ${to}`,
    text: `Attached is the timesheet report for ${from} to ${to}.`,
    attachments: [
      {
        filename: `timesheet-report-${from}-to-${to}.pdf`,
        content: pdfBuffer,
      },
    ],
    fromName: FROM_NAME,
  })
}
