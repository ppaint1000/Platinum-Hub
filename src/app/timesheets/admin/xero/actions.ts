'use server'

// Timesheets → Xero payroll. Admins only.
import { revalidatePath } from 'next/cache'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { disconnectXero, xeroEmployees } from '@/lib/xero/client'
import { sendTimesheet, type SendResult } from '@/lib/xero/timesheets'

async function admin() {
  const profile = await getCurrentProfile()
  if (profile.role !== 'admin') throw new Error('Admins only.')
  return profile
}

export async function saveEmployeeLinksAction(links: { userId: string; xeroEmployeeId: string | null; xeroName: string | null }[]) {
  await admin()
  const db = createAdminClient()
  const keep = links.filter((l) => l.xeroEmployeeId)
  const clear = links.filter((l) => !l.xeroEmployeeId).map((l) => l.userId)
  if (keep.length) {
    const { error } = await db.from('xero_employee_links').upsert(
      keep.map((l) => ({ user_id: l.userId, xero_employee_id: l.xeroEmployeeId, xero_name: l.xeroName, updated_at: new Date().toISOString() })),
      { onConflict: 'user_id' }
    )
    if (error) return { error: error.message }
  }
  if (clear.length) await db.from('xero_employee_links').delete().in('user_id', clear)
  revalidatePath('/timesheets/admin/xero')
  return {}
}

export async function setEarningsRateAction(id: string, name: string) {
  await admin()
  const { error } = await createAdminClient()
    .from('xero_connection')
    .update({ earnings_rate_id: id || null, earnings_rate_name: name || null, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { error: error.message }
  revalidatePath('/timesheets/admin/xero')
  return {}
}

export async function sendTimesheetsAction(input: {
  calendarId: string
  start: string
  end: string
  userIds: string[]
}): Promise<{ error?: string; results?: SendResult[] }> {
  const profile = await admin()
  const db = createAdminClient()
  const [{ data: conn }, { data: links }, { data: people }, employees] = await Promise.all([
    db.from('xero_connection').select('earnings_rate_id').eq('id', 1).maybeSingle(),
    db.from('xero_employee_links').select('user_id, xero_employee_id').in('user_id', input.userIds),
    db.from('profiles').select('id, full_name').in('id', input.userIds),
    xeroEmployees(),
  ])
  if (!conn?.earnings_rate_id) return { error: 'Choose the pay item for hours first.' }
  const nameOf = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]))
  const calendarOf = new Map(employees.map((e) => [e.employeeID, e.payrollCalendarID]))

  const results: SendResult[] = []
  for (const link of links ?? []) {
    const name = nameOf.get(link.user_id as string) ?? 'Someone'
    if (calendarOf.get(link.xero_employee_id as string) !== input.calendarId) {
      results.push({ userId: link.user_id as string, name, ok: false, message: "Not on this pay calendar in Xero - skipped." })
      continue
    }
    results.push(
      await sendTimesheet({
        userId: link.user_id as string,
        name,
        employeeId: link.xero_employee_id as string,
        calendarId: input.calendarId,
        earningsRateId: conn.earnings_rate_id as string,
        start: input.start,
        end: input.end,
        pushedBy: profile.id,
      })
    )
  }
  revalidatePath('/timesheets/admin/xero')
  return { results }
}

export async function disconnectXeroAction() {
  await admin()
  await disconnectXero()
  revalidatePath('/timesheets/admin/xero')
}
