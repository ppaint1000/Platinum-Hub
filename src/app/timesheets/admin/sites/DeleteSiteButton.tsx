'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteSite } from '@/lib/timesheets/actions/sites'

export function DeleteSiteButton({ siteId }: { siteId: string }) {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  function handleClick() {
    setError('')
    startTransition(async () => {
      try {
        const result = await deleteSite(siteId)
        if (result?.error) {
          setError(result.error)
          return
        }
        router.refresh()
      } catch {
        setError('Request failed — check your connection and try again.')
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-sm text-red-600 underline disabled:opacity-50"
      >
        {pending ? 'Deleting…' : 'Delete'}
      </button>
      {error && <p className="max-w-[16rem] text-right text-xs text-red-600">{error}</p>}
    </div>
  )
}
