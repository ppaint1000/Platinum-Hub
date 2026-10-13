'use server'

// Records a reply from the 8am reminder: an absence for that day (sick,
// leave, rained off), or for "running late" just a heads-up email. Either
// way admins and supervisors hear about it.
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { REPLIES, verifyReply, type ReplyKey } from '@/lib/timesheets/replyLinks'
import { notificationRecipients } from '@/lib/notifications/recipients'
import { sendEmail } from '@/lib/email/mailer'

export async function recordReplyAction(formData: FormData) {
  const userId = String(formData.get('userId') ?? '')
  const day = String(formData.get('day') ?? '')
  const sig = String(formData.get('sig') ?? '')
  const reply = String(formData.get('reply') ?? '') as ReplyKey
  if (!(reply in REPLIES) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !(await verifyReply(userId, day, sig))) redirect('/sign-in')

  const db = createAdminClient()
  const type = REPLIES[reply].absenceType
  if (type) {
    // Their reply sets the reason, unless the office has already recorded one.
    const { data: existing } = await db.from('absences').select('id, absence_type').eq('user_id', userId).eq('absence_date', day).maybeSingle()
    if (!existing) {
      await db.from('absences').insert({
        user_id: userId,
        absence_date: day,
        absence_type: type,
        reason: 'Told us from the 8am reminder',
        flagged_by_check: false,
        recorded_at: new Date().toISOString(),
      })
    } else if (!existing.absence_type) {
      await db
        .from('absences')
        .update({ absence_type: type, reason: 'Told us from the 8am reminder', recorded_at: new Date().toISOString() })
        .eq('id', existing.id)
    }
  }

  try {
    const [{ data: person }, to] = await Promise.all([
      db.from('profiles').select('full_name').eq('id', userId).single(),
      notificationRecipients('staff_reply'),
    ])
    const h = await headers()
    const origin = h.get('origin') ?? `https://${h.get('host')}`
    if (to.length) {
      await sendEmail({
        to: to.join(', '),
        fromName: 'Platinum Painters Hub',
        subject: `${person?.full_name ?? 'Someone'}: ${REPLIES[reply].label}`,
        text:
          `${person?.full_name ?? 'Someone'} replied to the clock-on reminder: "${REPLIES[reply].label}" (${day}).\n\n` +
          (type ? `It's recorded on Absences: ${origin}/absences\n` : `They haven't clocked on yet - they'll clock on when they arrive.\n`),
      })
    }
  } catch (e) {
    console.error('[reply] notify failed', e)
  }

  redirect(`/r/${userId}/${day}/${sig}?done=${reply}`)
}
