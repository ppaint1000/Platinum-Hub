import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resendOpenWarnings } from '@/lib/security/windowsWarning'
import { safeEqual } from '@/lib/security/safeEqual'

// Called by Supabase's scheduler every 15 minutes
// (supabase/security_windows_warning.sql): resends any Hub WARNING an admin
// hasn't confirmed yet. Protected by the 'security_warnings' token.
export async function POST(request: NextRequest) {
  const provided = request.headers.get('x-cron-token')
  const { data } = await createAdminClient().from('app_cron_tokens').select('token').eq('name', 'security_warnings').maybeSingle()
  if (!safeEqual(provided, data?.token)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }
  return NextResponse.json(await resendOpenWarnings(request.nextUrl.origin))
}
