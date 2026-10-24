import { NextRequest, NextResponse } from 'next/server'
import { sendWeeklyReportEmail } from '@/lib/timesheets/email/weeklyReport'
import { safeEqual } from '@/lib/security/safeEqual'

// Intended to be called by a scheduled trigger (not a logged-in browser),
// so it's protected by a shared secret rather than user auth.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const provided = request.headers.get('x-cron-secret')

  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const result = await sendWeeklyReportEmail()
  return NextResponse.json(result, { status: result.sent ? 200 : 400 })
}
