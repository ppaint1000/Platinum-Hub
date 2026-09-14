'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, requireAdminOrSupervisor } from '@/lib/timesheets/authGuards'

export async function createCustomer(formData: FormData) {
  await requireAdminOrSupervisor()

  const name = formData.get('name')
  const contact_person = formData.get('contact_person')

  if (typeof name !== 'string' || !name.trim()) return

  const supabase = await createClient()
  await supabase.from('customers').insert({
    name: name.trim(),
    contact_person:
      typeof contact_person === 'string' && contact_person.trim()
        ? contact_person.trim()
        : null,
  })

  revalidatePath('/timesheets/admin/customers')
}

export async function updateCustomer(customerId: string, formData: FormData) {
  await requireAdmin()

  const name = formData.get('name')
  const contact_person = formData.get('contact_person')

  if (typeof name !== 'string' || !name.trim()) return

  const supabase = await createClient()
  await supabase
    .from('customers')
    .update({
      name: name.trim(),
      contact_person:
        typeof contact_person === 'string' && contact_person.trim()
          ? contact_person.trim()
          : null,
    })
    .eq('id', customerId)

  revalidatePath('/timesheets/admin/customers')
  redirect('/timesheets/admin/customers')
}

export async function setCustomerActive(customerId: string, isActive: boolean) {
  await requireAdmin()

  const supabase = await createClient()
  await supabase.from('customers').update({ is_active: isActive }).eq('id', customerId)

  revalidatePath('/timesheets/admin/customers')
}

// Only for customers with zero sites - one with sites would fail on the
// foreign key anyway, but checking first avoids relying on that for UX.
export async function deleteCustomer(customerId: string) {
  await requireAdmin()

  const supabase = await createClient()
  const { count } = await supabase
    .from('sites')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)

  if ((count ?? 0) > 0) return

  await supabase.from('customers').delete().eq('id', customerId)

  revalidatePath('/timesheets/admin/customers')
}
