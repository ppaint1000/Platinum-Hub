import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { groupByStaff, groupBySite, type StaffGroup, type SiteGroup } from '@/lib/timesheets/reportGroups'
import type { ReportEntry } from '@/lib/timesheets/reports'
import { toNZExcelDate } from '@/lib/timesheets/formatNZ'

const HEADER_LABELS = [
  'Start Time',
  'End Time',
  'Site',
  'Notes',
  'Start Geo',
  'End Geo',
  'Gross Hours',
  'Breaks',
  'Net Hours',
]

function blanks(n: number): string[] {
  return Array(n).fill('')
}

function addGroupTotalRow(sheet: ExcelJS.Worksheet, label: string, netHours: number, indent: number) {
  const row = sheet.addRow([...blanks(indent), label, `Total: ${netHours.toFixed(2)}`])
  row.getCell(indent + 1).font = { bold: true }
  row.getCell(indent + 2).font = { bold: true }
}

function addHeaderRow(sheet: ExcelJS.Worksheet, indent: number) {
  const row = sheet.addRow([...blanks(indent), ...HEADER_LABELS])
  for (let i = indent + 1; i <= indent + HEADER_LABELS.length; i++) {
    row.getCell(i).font = { bold: true }
  }
}

function addEntryRow(sheet: ExcelJS.Worksheet, entry: ReportEntry, indent: number) {
  const gross = (entry.hours ?? 0) + entry.break_minutes / 60

  const row = sheet.addRow([
    ...blanks(indent),
    toNZExcelDate(entry.clock_in_at),
    entry.clock_out_at ? toNZExcelDate(entry.clock_out_at) : '-',
    entry.site_name,
    entry.notes ?? '-',
    entry.clock_in_map_url ? { text: 'Map', hyperlink: entry.clock_in_map_url } : '-',
    entry.clock_out_map_url ? { text: 'Map', hyperlink: entry.clock_out_map_url } : '-',
    Number(gross.toFixed(2)),
    entry.break_minutes > 0 ? `${entry.break_minutes} mins` : '-',
    entry.hours !== null ? Number(entry.hours.toFixed(2)) : '-',
  ])

  row.getCell(indent + 1).numFmt = 'dd mmm yyyy hh:mm AM/PM'
  row.getCell(indent + 2).numFmt = 'dd mmm yyyy hh:mm AM/PM'
}

function buildStaffSheet(workbook: ExcelJS.Workbook, staffGroups: StaffGroup[]) {
  const sheet = workbook.addWorksheet('Staff')
  sheet.columns = [
    { width: 4 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
  ]

  for (const group of staffGroups) {
    addGroupTotalRow(sheet, group.userName, group.netHours, 0)
    addHeaderRow(sheet, 1)
    for (const entry of group.entries) addEntryRow(sheet, entry, 1)
    sheet.addRow([])
  }
}

function buildSiteSheet(workbook: ExcelJS.Workbook, siteGroups: SiteGroup[]) {
  const sheet = workbook.addWorksheet('Site')
  sheet.columns = [
    { width: 4 },
    { width: 4 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
  ]

  for (const site of siteGroups) {
    addGroupTotalRow(sheet, site.siteName, site.netHours, 0)
    for (const staffGroup of site.staffGroups) {
      addGroupTotalRow(sheet, staffGroup.userName, staffGroup.netHours, 1)
      addHeaderRow(sheet, 2)
      for (const entry of staffGroup.entries) addEntryRow(sheet, entry, 2)
      sheet.addRow([])
    }
  }
}

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile()
  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const params = request.nextUrl.searchParams
  const filters = {
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
    userId: params.get('userId') ?? undefined,
    siteId: params.get('siteId') ?? undefined,
  }

  const [staffGroups, siteGroups] = await Promise.all([
    groupByStaff(filters),
    groupBySite(filters),
  ])

  const workbook = new ExcelJS.Workbook()
  buildStaffSheet(workbook, staffGroups)
  buildSiteSheet(workbook, siteGroups)

  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="timesheet-report.xlsx"',
    },
  })
}
