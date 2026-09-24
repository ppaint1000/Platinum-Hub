import { createElement } from 'react'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import type { ReactElement } from 'react'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { sendEmail } from '@/lib/email/mailer'
import { applyPayRounding } from '@/lib/timesheets/payroll'
import { formatDateKeyShort } from '@/lib/timesheets/formatNZ'
import { TimesheetReportPdf } from '@/lib/timesheets/pdf/timesheet-report-pdf'
import type { ReportEntry } from '@/lib/timesheets/reports'

const FROM_NAME = 'Platinum Painters Timesheets'

export type SendConfirmationResult = { sent: true } | { sent: false; reason: string }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function sendTimesheetConfirmationEmail(options: {
  userName: string
  from: string
  to: string
  entries: ReportEntry[]
}): Promise<SendConfirmationResult> {
  const { entries: roundedEntries, dayTotals } = applyPayRounding(options.entries)
  const netHours = dayTotals.reduce((sum, d) => sum + d.hours, 0)
  const breakMinutes = roundedEntries.reduce((sum, e) => sum + e.break_minutes, 0)
  const flaggedDates = dayTotals.filter((d) => d.needsCheck).map((d) => formatDateKeyShort(d.date))

  const logoBuffer = await readFile(path.join(process.cwd(), 'public', 'logo.png'))
  const document = createElement(TimesheetReportPdf, {
    staffGroups: [
      {
        userName: options.userName,
        entries: roundedEntries,
        grossHours: round2(netHours + breakMinutes / 60),
        breakMinutes,
        netHours: round2(netHours),
      },
    ],
    dateRangeLabel: `${options.from} to ${options.to}`,
    logoSrc: { data: logoBuffer, format: 'png' as const },
    basic: true,
    flaggedDates,
  }) as ReactElement<DocumentProps>
  const pdfBuffer = await renderToBuffer(document)

  const recipient = process.env.WEEKLY_REPORT_EMAIL || 'nrichmond@platinumpainters.co.nz'

  return sendEmail({
    to: recipient,
    subject: `Timesheet confirmed: ${options.userName} — week ending ${options.to}`,
    text: `${options.userName} confirmed their timesheet for ${options.from} to ${options.to}.\n\nTotal hours: ${round2(netHours).toFixed(2)}${flaggedDates.length > 0 ? `\n\nPlease check hours for: ${flaggedDates.join(', ')} (multiple site visits that day).` : ''}`,
    attachments: [
      {
        filename: `timesheet-${options.userName.replace(/\s+/g, '-').toLowerCase()}-${options.to}.pdf`,
        content: pdfBuffer,
      },
    ],
    fromName: FROM_NAME,
  })
}
