import { NextRequest, NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { completeXeroConnection } from '@/lib/xero/client'

// Xero sends the admin back here after they click Allow.
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile()
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/timesheets/admin/xero?${q}`, request.url))
    res.cookies.delete('xero_state')
    return res
  }
  if (profile.role !== 'admin') return NextResponse.redirect(new URL('/hub', request.url))

  const params = request.nextUrl.searchParams
  if (params.get('error')) return back(`error=${encodeURIComponent(params.get('error') ?? 'cancelled')}`)
  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state || state !== request.cookies.get('xero_state')?.value) return back('error=expired')

  try {
    const name = await completeXeroConnection(code, request.nextUrl.origin, profile.id)
    return back(`connected=${encodeURIComponent(name)}`)
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : 'failed')}`)
  }
}
