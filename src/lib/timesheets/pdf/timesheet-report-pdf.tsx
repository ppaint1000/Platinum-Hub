import { Document, Page, View, Text, Image, Link, StyleSheet } from '@react-pdf/renderer'
import type { StaffGroup } from '@/lib/timesheets/reportGroups'
import { formatNZDateTimeLong } from '@/lib/timesheets/formatNZ'

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  logo: { width: 90, height: 36 },
  title: { fontSize: 16, fontWeight: 'bold' },
  subtitle: { fontSize: 10, color: '#555555' },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f2f2f2',
    padding: 6,
    marginTop: 12,
  },
  groupName: { fontSize: 11, fontWeight: 'bold' },
  groupTotals: { fontSize: 9 },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottom: '1 solid #999999',
    paddingBottom: 2,
    marginTop: 4,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '0.5 solid #dddddd',
    paddingVertical: 3,
  },
  cell: { fontSize: 8, paddingRight: 4 },
  headerCell: { fontSize: 8, fontWeight: 'bold', paddingRight: 4 },
  link: { fontSize: 8, color: '#1a56db', textDecoration: 'none' },
  pageNumber: { position: 'absolute', bottom: 16, right: 24, fontSize: 8, color: '#999999' },
  checkNote: { backgroundColor: '#fff3cd', padding: 6, marginBottom: 8 },
  checkNoteText: { fontSize: 9, color: '#856404' },
  watermark: { position: 'absolute', top: '35%', left: '12%', width: '76%', opacity: 0.11 },
})

const COLS = {
  start: '15%',
  end: '15%',
  site: '17%',
  notes: '14%',
  startGeo: '8%',
  endGeo: '8%',
  gross: '8%',
  breaks: '7%',
  net: '8%',
}

const BASIC_COLS = {
  start: '18%',
  end: '18%',
  site: '22%',
  notes: '20%',
  gross: '8%',
  breaks: '6%',
  net: '8%',
}

const formatDateTime = formatNZDateTimeLong

export function TimesheetReportPdf({
  staffGroups,
  dateRangeLabel,
  logoSrc,
  basic = false,
  flaggedDates = [],
}: {
  staffGroups: StaffGroup[]
  dateRangeLabel: string
  logoSrc: { data: Buffer; format: 'png' }
  basic?: boolean
  // Dates (already formatted for display) where a staff member visited more
  // than one site - the day total was rounded to the nearest half hour to
  // stay payable, so it's worth a human double-checking that day.
  flaggedDates?: string[]
}) {
  const cols = basic ? BASIC_COLS : COLS
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img */}
        <Image src={logoSrc} style={styles.watermark} fixed />
        <View style={styles.header} fixed>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img */}
          <Image src={logoSrc} style={styles.logo} />
          <View>
            <Text style={styles.title}>Timesheet Report</Text>
            <Text style={styles.subtitle}>{dateRangeLabel}</Text>
          </View>
        </View>

        {flaggedDates.length > 0 && (
          <View style={styles.checkNote}>
            <Text style={styles.checkNoteText}>
              Please check hours for: {flaggedDates.join(', ')} (multiple site visits that day).
            </Text>
          </View>
        )}

        {staffGroups.length === 0 && <Text>No entries match these filters.</Text>}

        {staffGroups.map((group) => (
          <View key={group.userName} wrap={false} style={{ marginBottom: 8 }}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupName}>{group.userName}</Text>
              <Text style={styles.groupTotals}>
                Gross {group.grossHours.toFixed(2)}h · Break {group.breakMinutes}m · Net{' '}
                {group.netHours.toFixed(2)}h
              </Text>
            </View>

            <View style={styles.tableHeaderRow}>
              <Text style={[styles.headerCell, { width: cols.start }]}>Start</Text>
              <Text style={[styles.headerCell, { width: cols.end }]}>End</Text>
              <Text style={[styles.headerCell, { width: cols.site }]}>Site</Text>
              <Text style={[styles.headerCell, { width: cols.notes }]}>Notes</Text>
              {!basic && (
                <>
                  <Text style={[styles.headerCell, { width: COLS.startGeo }]}>Start Geo</Text>
                  <Text style={[styles.headerCell, { width: COLS.endGeo }]}>End Geo</Text>
                </>
              )}
              <Text style={[styles.headerCell, { width: cols.gross }]}>Gross</Text>
              <Text style={[styles.headerCell, { width: cols.breaks }]}>Break</Text>
              <Text style={[styles.headerCell, { width: cols.net }]}>Net</Text>
            </View>

            {group.entries.map((entry) => {
              const gross = (entry.hours ?? 0) + entry.break_minutes / 60
              return (
                <View key={entry.id} style={styles.tableRow} wrap={false}>
                  <Text style={[styles.cell, { width: cols.start }]}>
                    {formatDateTime(entry.clock_in_at)}
                  </Text>
                  <Text style={[styles.cell, { width: cols.end }]}>
                    {entry.clock_out_at ? formatDateTime(entry.clock_out_at) : '-'}
                  </Text>
                  <Text style={[styles.cell, { width: cols.site }]}>{entry.site_name}</Text>
                  <Text style={[styles.cell, { width: cols.notes }]}>{entry.notes ?? '-'}</Text>
                  {!basic &&
                    (entry.clock_in_map_url ? (
                      <Link src={entry.clock_in_map_url} style={[styles.link, { width: COLS.startGeo }]}>
                        Map
                      </Link>
                    ) : (
                      <Text style={[styles.cell, { width: COLS.startGeo }]}>-</Text>
                    ))}
                  {!basic &&
                    (entry.clock_out_map_url ? (
                      <Link src={entry.clock_out_map_url} style={[styles.link, { width: COLS.endGeo }]}>
                        Map
                      </Link>
                    ) : (
                      <Text style={[styles.cell, { width: COLS.endGeo }]}>-</Text>
                    ))}
                  <Text style={[styles.cell, { width: cols.gross }]}>{gross.toFixed(2)}</Text>
                  <Text style={[styles.cell, { width: cols.breaks }]}>
                    {entry.break_minutes > 0 ? `${entry.break_minutes}m` : '-'}
                  </Text>
                  <Text style={[styles.cell, { width: cols.net }]}>
                    {entry.hours !== null ? entry.hours.toFixed(2) : '-'}
                  </Text>
                </View>
              )
            })}
          </View>
        ))}

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}
