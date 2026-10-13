// A reply from the 8am clock-on reminder ("I'm sick today" etc.). Opening
// the link only asks to confirm - email apps sometimes open links by
// themselves - and the button records it. No sign-in: the link is signed
// for this person and day (lib/timesheets/replyLinks.ts).
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { REPLIES, verifyReply, type ReplyKey } from '@/lib/timesheets/replyLinks'
import { recordReplyAction } from './actions'

export const dynamic = 'force-dynamic'

const nzDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })

export default async function ReplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string; day: string; sig: string }>
  searchParams: Promise<{ a?: string; done?: string }>
}) {
  const { userId, day, sig } = await params
  const { a, done } = await searchParams
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !(await verifyReply(userId, day, sig))) notFound()
  const reply = (a && a in REPLIES ? a : null) as ReplyKey | null
  const { data: person } = await createAdminClient().from('profiles').select('full_name').eq('id', userId).single()
  const first = (person?.full_name as string | undefined)?.split(' ')[0] ?? ''

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6 text-center">
      {done ? (
        <>
          <p className="text-2xl font-semibold">Thanks{first ? `, ${first}` : ''} - got it.</p>
          <p className="text-black/70">
            {done === 'late' ? "We've let the office know you're running late. Clock on when you arrive." : "The office has been told. Hope it's a good day."}
          </p>
        </>
      ) : !reply ? (
        <>
          <p className="text-xl font-semibold">What would you like to tell the office for {nzDay(day)}?</p>
          {(Object.keys(REPLIES) as ReplyKey[]).map((k) => (
            <form key={k} action={recordReplyAction}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="day" value={day} />
              <input type="hidden" name="sig" value={sig} />
              <input type="hidden" name="reply" value={k} />
              <button className="min-h-12 w-full rounded-lg bg-black px-4 font-semibold text-white">{REPLIES[k].label}</button>
            </form>
          ))}
        </>
      ) : (
        <>
          <p className="text-xl font-semibold">
            {first ? `${first}, ` : ''}tell the office &quot;{REPLIES[reply].label}&quot; for {nzDay(day)}?
          </p>
          <form action={recordReplyAction}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="day" value={day} />
            <input type="hidden" name="sig" value={sig} />
            <input type="hidden" name="reply" value={reply} />
            <button className="min-h-12 w-full rounded-lg bg-[#D21F26] px-4 font-semibold text-white">Yes, send it</button>
          </form>
          <p className="text-sm text-black/60">Wrong button? Just close this page - nothing has been sent yet.</p>
        </>
      )}
    </main>
  )
}
