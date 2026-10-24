import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendClockReminders, type ReminderKind } from '@/lib/timesheets/email/clockReminders'
import { safeEqual } from '@/lib/security/safeEqual'

// Called by Supabase's scheduler (supabase/clock_reminders.sql) at 8am and
// 4:30pm NZ time. Not a logged-in browser, so it's protected by a token the
// scheduler reads from app_cron_tokens (service role only).
export async function POST(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get('kind') as ReminderKind | null
  if (kind !== 'on' && kind !== 'off') return NextResponse.json({ error: 'kind must be on or off' }, { status: 400 })

  const provided = request.headers.get('x-cron-token')
  const { data } = await createAdminClient().from('app_cron_tokens').select('token').eq('name', 'clock_reminders').maybeSingle()
  if (!safeEqual(provided, data?.token)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const result = await sendClockReminders(kind, request.nextUrl.origin)
  return NextResponse.json(result)
}
