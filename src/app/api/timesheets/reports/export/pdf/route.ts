import { createElement } from 'react'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { groupByStaff } from '@/lib/timesheets/reportGroups'
import { TimesheetReportPdf } from '@/lib/timesheets/pdf/timesheet-report-pdf'

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile()
  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const from = params.get('from') || undefined
  const to = params.get('to') || undefined

  const staffGroups = await groupByStaff({
    from,
    to,
    userId: params.get('userId') ?? undefined,
    siteId: params.get('siteId') ?? undefined,
  })

  const dateRangeLabel = from || to ? `${from ?? 'Start'} to ${to ?? 'Now'}` : 'All dates'
  const logoBuffer = await readFile(path.join(process.cwd(), 'public', 'logo.png'))

  const document = createElement(TimesheetReportPdf, {
    staffGroups,
    dateRangeLabel,
    logoSrc: { data: logoBuffer, format: 'png' as const },
  }) as ReactElement<DocumentProps>

  const buffer = await renderToBuffer(document)

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="timesheet-report.pdf"',
    },
  })
}
