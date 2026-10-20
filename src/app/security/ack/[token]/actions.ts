'use server'

// "I've read this" on a Hub WARNING: stops the 15-minute repeats.
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { warningByToken } from '@/lib/security/windowsWarning'

export async function acknowledgeWarningAction(formData: FormData) {
  const token = String(formData.get('token') ?? '')
  const name = String(formData.get('name') ?? '').trim().slice(0, 80)
  const w = await warningByToken(token)
  if (!w) redirect('/sign-in')
  if (!w.acknowledged_at) {
    await createAdminClient()
      .from('hub_security_warnings')
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: name || null })
      .eq('id', w.id)
      .is('acknowledged_at', null)
  }
  redirect(`/security/ack/${token}`)
}
