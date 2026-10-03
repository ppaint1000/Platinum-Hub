'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setStatus('ready')
    })

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus('ready')
    })

    const timeout = setTimeout(() => {
      setStatus((current) => (current === 'checking' ? 'invalid' : current))
    }, 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setPending(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setPending(false)

    if (error) {
      setError(error.message)
      return
    }

    router.push('/')
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Image src="/logo.webp" alt="Platinum Painters" width={160} height={64} priority />
          <h1 className="text-xl font-semibold">Set your password</h1>
        </div>

        {status === 'checking' && (
          <p className="text-center text-sm text-black/60">Checking your link…</p>
        )}

        {status === 'invalid' && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-red-600">
              This link is invalid or has expired. Ask an admin to send you a new one.
            </p>
            <a href="/sign-in" className="text-sm underline">
              Back to sign in
            </a>
          </div>
        )}

        {status === 'ready' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-medium">
                New password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-black/20 px-3 py-2"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="confirm" className="text-sm font-medium">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-md border border-black/20 px-3 py-2"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-black px-3 py-2 text-white disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Set password'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
