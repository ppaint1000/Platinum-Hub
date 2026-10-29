import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/timesheets/authGuards'
import { nzTodayDateString } from '@/lib/timesheets/formatNZ'
import { AddShiftForm } from './add-shift-form'

// Admin: add a whole shift after the fact (forgot to clock in, flat phone).
export default async function AddShiftPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>
}) {
  await requireAdmin()

  const { returnTo: returnToParam } = await searchParams
  const returnTo =
    returnToParam && returnToParam.startsWith('/timesheets/') ? returnToParam : '/timesheets/admin/reports'

  const supabase = await createClient()
  const [{ data: staff }, { data: sites }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('sites').select('id, name').eq('is_active', true).order('name'),
  ])

  return (
    <div className="max-w-lg space-y-4">
      <Link href={returnTo} className="text-sm underline">
        &larr; Back
      </Link>
      <h1 className="text-2xl font-semibold">Add shift</h1>
      <p className="text-sm text-black/60">For a shift someone worked but didn&apos;t clock. Times are NZ time.</p>
      <AddShiftForm
        staff={(staff ?? []).map((s) => ({ id: s.id, name: s.full_name ?? 'Unnamed' }))}
        sites={(sites ?? []).map((s) => ({ id: s.id, name: s.name }))}
        returnTo={returnTo}
        defaultDate={nzTodayDateString()}
      />
    </div>
  )
}
