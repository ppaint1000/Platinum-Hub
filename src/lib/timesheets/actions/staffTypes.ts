'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/timesheets/authGuards'

export async function createStaffType(formData: FormData) {
  await requireAdmin()

  const name = formData.get('name')
  if (typeof name !== 'string' || !name.trim()) return

  const supabase = await createClient()
  await supabase.from('staff_types').insert({ name: name.trim() })

  revalidatePath('/timesheets/admin/staff-types')
}

export async function setStaffTypeActive(staffTypeId: string, isActive: boolean) {
  await requireAdmin()

  const supabase = await createClient()
  await supabase.from('staff_types').update({ is_active: isActive }).eq('id', staffTypeId)

  revalidatePath('/timesheets/admin/staff-types')
}

export async function deleteStaffType(staffTypeId: string) {
  await requireAdmin()

  const supabase = await createClient()
  await supabase.from('staff_types').delete().eq('id', staffTypeId)

  revalidatePath('/timesheets/admin/staff-types')
}
