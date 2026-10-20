// The link in a Hub WARNING email. Opening it only asks to confirm (email
// apps sometimes open links by themselves); the button stops the repeats.
// No sign-in: the link's secret token is the key.
import { notFound } from 'next/navigation'
import { warningByToken } from '@/lib/security/windowsWarning'
import { describeDevice } from '@/lib/security/describe'
import { formatNZDateTime } from '@/lib/timesheets/formatNZ'
import { acknowledgeWarningAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function AckWarningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const w = await warningByToken(token)
  if (!w) notFound()
  const person = (Array.isArray(w.profiles) ? w.profiles[0] : w.profiles) as { full_name: string } | null
  const name = person?.full_name ?? 'Someone'

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-[#D21F26]">Hub WARNING</p>
      <p className="text-xl font-semibold">
        {name} signed in on a new {describeDevice(w.user_agent as string | null)}
      </p>
      <p className="text-black/70">{formatNZDateTime(w.signed_in_at as string)}</p>
      {w.acknowledged_at ? (
        <p className="rounded-lg bg-green-50 p-4 font-semibold text-green-800">
          Confirmed as read{w.acknowledged_by ? ` by ${w.acknowledged_by}` : ''} at {formatNZDateTime(w.acknowledged_at as string)}. The warning emails have stopped.
        </p>
      ) : (
        <form action={acknowledgeWarningAction} className="flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          <input name="name" placeholder="Your name" className="min-h-12 rounded-lg border border-black/20 px-4" />
          <button className="min-h-12 w-full rounded-lg bg-[#D21F26] px-4 font-semibold text-white">I&apos;ve read this - stop the warnings</button>
          <p className="text-sm text-black/60">Sent {w.send_count} time{w.send_count === 1 ? '' : 's'} so far. If this wasn&apos;t them, turn their account off in Users.</p>
        </form>
      )}
    </main>
  )
}
