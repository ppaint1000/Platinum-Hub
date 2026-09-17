'use client'

import { useFormStatus } from 'react-dom'

// Disables the button while the form is submitting — createSite has no
// duplicate-name guard, so rapid double/triple-clicks on a slow connection
// previously created several identical sites (each auto-creating its own
// linked job) in one go.
export function AddSiteSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
    >
      {pending ? 'Adding…' : 'Add site'}
    </button>
  )
}
