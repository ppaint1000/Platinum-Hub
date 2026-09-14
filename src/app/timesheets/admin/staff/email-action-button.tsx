'use client'

import { useActionState } from 'react'
import type { EmailActionState } from '@/lib/timesheets/actions/staff'

export function EmailActionButton({
  action,
  label,
  pendingLabel,
  successMessage,
}: {
  action: (state: EmailActionState, formData: FormData) => Promise<EmailActionState>
  label: string
  pendingLabel: string
  successMessage: string
}) {
  const [state, formAction, pending] = useActionState(action, undefined)

  return (
    <div className="flex flex-col items-start gap-0.5">
      <form action={formAction}>
        <button type="submit" disabled={pending} className="text-sm underline disabled:opacity-50">
          {pending ? pendingLabel : label}
        </button>
      </form>
      {state?.success && <p className="text-xs text-green-700">{successMessage}</p>}
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
    </div>
  )
}
