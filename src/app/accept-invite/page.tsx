'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import type { EmailOtpType } from '@supabase/supabase-js'

function AcceptInviteForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'idle' | 'verifying' | 'error'>('idle')

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const heading = type === 'recovery' ? 'Reset your password' : 'Join Platinum Painters'

  async function handleContinue() {
    if (!tokenHash || !type) {
      setStatus('error')
      return
    }

    setStatus('verifying')
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })

    if (error) {
      setStatus('error')
      return
    }

    router.push('/reset-password')
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Image src="/logo.webp" alt="Platinum Painters" width={160} height={64} priority />
          <h1 className="text-xl font-semibold">{heading}</h1>
        </div>

        {status !== 'error' && (!tokenHash || !type) ? (
          <p className="text-center text-sm text-red-600">
            This link is invalid or has expired. Ask an admin to send you a new one.
          </p>
        ) : status === 'error' ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-red-600">
              This link is invalid or has expired. Ask an admin to send you a new one.
            </p>
            <a href="/sign-in" className="text-sm underline">
              Back to sign in
            </a>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <p className="text-sm text-black/60">
              Tap continue to {type === 'recovery' ? 'reset your password' : 'set up your account'}.
            </p>
            <button
              onClick={handleContinue}
              disabled={status === 'verifying'}
              className="w-full rounded-md bg-black px-3 py-2 text-white disabled:opacity-50"
            >
              {status === 'verifying' ? 'Checking…' : 'Continue'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense>
      <AcceptInviteForm />
    </Suspense>
  )
}
