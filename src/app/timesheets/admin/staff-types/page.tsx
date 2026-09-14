import { createClient } from '@/lib/supabase/server'
import { createStaffType, setStaffTypeActive, deleteStaffType } from '@/lib/timesheets/actions/staffTypes'
import { requireAdmin } from '@/lib/timesheets/authGuards'

type StaffType = {
  id: string
  name: string
  is_active: boolean
}

export default async function StaffTypesPage() {
  await requireAdmin()

  const supabase = await createClient()
  const { data: staffTypes } = await supabase
    .from('staff_types')
    .select('id, name, is_active')
    .order('is_active', { ascending: false })
    .order('name', { ascending: true })

  const typeList = (staffTypes ?? []) as StaffType[]
  const active = typeList.filter((t) => t.is_active)
  const archived = typeList.filter((t) => !t.is_active)

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Manage Staff Types</h1>
        <p className="text-sm text-black/60">
          Admin-only. A managed list of staff types (e.g. Painter, Apprentice, Contractor).
        </p>
      </div>

      <form
        action={createStaffType}
        className="space-y-3 rounded-lg border border-black/10 p-4"
      >
        <h2 className="font-medium">Add a staff type</h2>
        <div className="space-y-1">
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            className="w-full rounded-md border border-black/20 px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
        >
          Add staff type
        </button>
      </form>

      <StaffTypeList
        title="Active staff types"
        staffTypes={active}
        emptyText="No active staff types yet."
      />
      {archived.length > 0 && (
        <StaffTypeList title="Archived staff types" staffTypes={archived} emptyText="" />
      )}
    </div>
  )
}

function StaffTypeList({
  title,
  staffTypes,
  emptyText,
}: {
  title: string
  staffTypes: StaffType[]
  emptyText: string
}) {
  return (
    <div className="space-y-3">
      <h2 className="font-medium">{title}</h2>
      {staffTypes.length === 0 && <p className="text-sm text-black/60">{emptyText}</p>}
      <ul className="divide-y divide-black/10 rounded-lg border border-black/10">
        {staffTypes.map((staffType) => (
          <li key={staffType.id} className="flex items-center justify-between gap-4 p-3">
            <p className="font-medium">{staffType.name}</p>
            <div className="flex shrink-0 items-center gap-3">
              <form action={setStaffTypeActive.bind(null, staffType.id, !staffType.is_active)}>
                <button type="submit" className="text-sm underline">
                  {staffType.is_active ? 'Archive' : 'Restore'}
                </button>
              </form>
              {!staffType.is_active && (
                <form action={deleteStaffType.bind(null, staffType.id)}>
                  <button type="submit" className="text-sm text-red-600 underline">
                    Delete
                  </button>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
