import { sendEmail } from '@/lib/email/mailer'
import { formatNZDateTime } from '@/lib/timesheets/formatNZ'

const FROM_NAME = 'Platinum Painters Timesheets'

// This app's own URL (not siteUrl.ts's SITE_URL, which deliberately still
// points at the separate standalone Timesheets app for auth-token
// exchange only - see its own comment).
const HUB_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'https://platinum-painters-hub.vercel.app'

// Fires when a painter files a change request — a heads-up only, the
// request itself is what admins act on from
// /timesheets/admin/change-requests, so a failed send here doesn't block
// filing the request (see submitChangeRequest, which ignores this result).
export async function sendChangeRequestEmail(options: {
  userName: string
  date: string
  siteName: string
  currentStart: string
  currentFinish: string | null
  requestedStart: string | null
  requestedFinish: string | null
  requestedSiteName: string | null
  note: string
}) {
  const recipient = process.env.WEEKLY_REPORT_EMAIL || 'nrichmond@platinumpainters.co.nz'

  const lines = [
    `${options.userName} has requested a timesheet correction for ${options.date} (${options.siteName}).`,
    '',
    `Current start: ${formatNZDateTime(options.currentStart)}`,
    `Current finish: ${options.currentFinish ? formatNZDateTime(options.currentFinish) : 'still open'}`,
  ]
  if (options.requestedStart) lines.push(`Requested start: ${formatNZDateTime(options.requestedStart)}`)
  if (options.requestedFinish) lines.push(`Requested finish: ${formatNZDateTime(options.requestedFinish)}`)
  if (options.requestedSiteName) lines.push(`Requested site/job: ${options.requestedSiteName}`)
  if (options.note.trim()) lines.push('', `Note: ${options.note.trim()}`)
  lines.push('', `Review and action this: ${HUB_URL}/timesheets/admin/change-requests`)

  return sendEmail({
    to: recipient,
    subject: `Timesheet change request: ${options.userName} — ${options.date}`,
    text: lines.join('\n'),
    fromName: FROM_NAME,
  })
}
