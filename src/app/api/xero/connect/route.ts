import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { xeroAuthorizeUrl, xeroConfigured } from '@/lib/xero/client'

// "Connect to Xero": sends an admin to Xero to choose the organisation and
// click Allow. The state cookie proves the reply is for this request.
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile()
  if (profile.role !== 'admin') return NextResponse.redirect(new URL('/hub', request.url))
  if (!xeroConfigured()) return NextResponse.redirect(new URL('/timesheets/admin/xero?error=not-set-up', request.url))

  const state = randomBytes(16).toString('hex')
  const res = NextResponse.redirect(xeroAuthorizeUrl(request.nextUrl.origin, state))
  res.cookies.set('xero_state', state, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/' })
  return res
}
