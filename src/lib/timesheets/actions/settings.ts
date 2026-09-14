'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/timesheets/authGuards'
import { sendWeeklyReportEmail, type SendWeeklyReportResult } from '@/lib/timesheets/email/weeklyReport'

export async function setWeeklyReportEnabled(formData: FormData) {
  await requireAdmin()

  const enabled = formData.get('enabled') === 'true'

  const supabase = await createClient()
  await supabase.from('app_settings').update({ weekly_report_enabled: enabled }).eq('id', true)

  revalidatePath('/timesheets/admin/reports')
}

export async function sendWeeklyReportNow(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's action signature
  _prevState: SendWeeklyReportResult | undefined
): Promise<SendWeeklyReportResult> {
  await requireAdmin()

  return sendWeeklyReportEmail()
}
