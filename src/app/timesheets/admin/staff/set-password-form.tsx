'use client'

import { useActionState, useEffect, useRef } from 'react'
import { setStaffPassword } from '@/lib/timesheets/actions/staff'

export function SetPasswordForm({ staffId }: { staffId: string }) {
  const [state, formAction, pending] = useActionState(
    setStaffPassword.bind(null, staffId),
    undefined
  )
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.success) formRef.current?.reset()
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="space-y-2 rounded-lg border border-black/10 p-4">
      <h2 className="font-medium">Set a password</h2>
      <p className="text-sm text-black/60">
        Sets their password directly - they can sign in with it immediately, without needing an
        email.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border border-black/20 px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Set password'}
        </button>
      </div>
      {state?.success && <p className="text-sm text-green-700">Password updated.</p>}
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  )
}
