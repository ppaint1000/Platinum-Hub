// Links in the 8am "clock on" reminder that let someone say why they're not
// in - "I'm sick today", "On leave", "Rained off", "Running late" - without
// signing in. Each link is signed for that person and that day only, so it
// can't be guessed or reused. Server-side only.
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const REPLIES = {
  sick: { label: "I'm sick today", absenceType: 'sick' },
  leave: { label: "I'm on leave", absenceType: 'authorised_leave' },
  rained: { label: 'Rained off', absenceType: 'rained_off' },
  late: { label: 'Running late', absenceType: null },
} as const
export type ReplyKey = keyof typeof REPLIES

async function key() {
  const { data } = await createAdminClient().from('app_cron_tokens').select('token').eq('name', 'hub_cron').single()
  if (!data?.token) throw new Error('No signing key')
  return data.token as string
}

export async function signReply(userId: string, day: string) {
  return createHmac('sha256', await key()).update(`reply:${userId}:${day}`).digest('base64url').slice(0, 32)
}

export async function verifyReply(userId: string, day: string, sig: string) {
  const expected = await signReply(userId, day)
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
}

export async function replyLink(origin: string, userId: string, day: string, reply: ReplyKey) {
  return `${origin}/r/${userId}/${day}/${await signReply(userId, day)}?a=${reply}`
}
