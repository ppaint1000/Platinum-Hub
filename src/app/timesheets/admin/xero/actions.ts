'use server'

// Timesheets → Xero payroll. Admins only.
import { revalidatePath } from 'next/cache'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { createAdminClient } from '@/lib/supabase/admin'
import { disconnectXero } from '@/lib/xero/client'
import { sendPeriod, type SendResult } from '@/lib/xero/timesheets'

async function admin() {
  const profile = await getCurrentProfile()
  if (profile.role !== 'admin') throw new Error('Admins only.')
  return profile
}

// Save who's who; with `renameToXero`, matched people also take their Xero
// name in the Hub (Xero's is the payroll-correct spelling). Everything is
// linked by person, not name, so their history stays with them.
export async function saveEmployeeLinksAction(
  links: { userId: string; xeroEmployeeId: string | null; xeroName: string | null; rateId?: string | null; rateName?: string | null }[],
  renameToXero = false
) {
  await admin()
  const db = createAdminClient()
  if (renameToXero) {
    for (const l of links.filter((x) => x.xeroEmployeeId && x.xeroName?.trim())) {
      const { error } = await db.from('profiles').update({ full_name: l.xeroName!.trim() }).eq('id', l.userId)
      if (error) return { error: error.message }
    }
  }
  const keep = links.filter((l) => l.xeroEmployeeId)
  const clear = links.filter((l) => !l.xeroEmployeeId).map((l) => l.userId)
  if (keep.length) {
    const { error } = await db.from('xero_employee_links').upsert(
      keep.map((l) => ({
        user_id: l.userId,
        xero_employee_id: l.xeroEmployeeId,
        xero_name: l.xeroName,
        earnings_rate_id: l.rateId || null,
        earnings_rate_name: l.rateId ? l.rateName ?? null : null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id' }
    )
    if (error) return { error: error.message }
  }
  if (clear.length) await db.from('xero_employee_links').delete().in('user_id', clear)
  // Names show all over the Hub.
  revalidatePath(renameToXero ? '/' : '/timesheets/admin/xero', renameToXero ? 'layout' : 'page')
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
  const r = await sendPeriod({ ...input, pushedBy: profile.id })
  revalidatePath('/timesheets/admin/xero')
  // Shifts were approved onto jobs too.
  revalidatePath('/jobs', 'layout')
  return r
}

export async function disconnectXeroAction() {
  await admin()
  await disconnectXero()
  revalidatePath('/timesheets/admin/xero')
}
