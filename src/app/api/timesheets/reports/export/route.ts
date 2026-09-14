import { NextRequest, NextResponse } from 'next/server'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { getReportEntries } from '@/lib/timesheets/reports'
import { formatNZDateTime } from '@/lib/timesheets/formatNZ'

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile()
  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const entries = await getReportEntries({
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    userId: params.get('userId') ?? undefined,
    siteId: params.get('siteId') ?? undefined,
  })

  const header = ['Staff', 'Customer', 'Site', 'Clock in', 'Clock out', 'Break (mins)', 'Hours', 'Notes']
  const rows = entries.map((e) => [
    e.user_name,
    e.customer_name,
    e.site_name,
    formatNZDateTime(e.clock_in_at),
    e.clock_out_at ? formatNZDateTime(e.clock_out_at) : '',
    e.break_minutes.toString(),
    e.hours?.toString() ?? '',
    e.notes ?? '',
  ])

  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="timesheet-report.csv"',
    },
  })
}
