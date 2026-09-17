import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createCustomer, setCustomerActive } from '@/lib/timesheets/actions/customers'
import { getCurrentProfile } from '@/lib/supabase/profile'
import { DeleteCustomerButton } from './DeleteCustomerButton'

type Customer = {
  id: string
  name: string
  contact_person: string | null
  is_active: boolean
  siteCount: number
  activeSiteCount: number
}

export default async function CustomersPage() {
  const profile = await getCurrentProfile()
  const canEdit = profile.role === 'admin'

  const supabase = await createClient()
  const [{ data: customers }, { data: siteRows }] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, contact_person, is_active')
      .order('is_active', { ascending: false })
      .order('name', { ascending: true }),
    supabase.from('sites').select('customer_id, is_active'),
  ])

  const siteCounts = new Map<string, number>()
  const activeSiteCounts = new Map<string, number>()
  for (const row of siteRows ?? []) {
    siteCounts.set(row.customer_id, (siteCounts.get(row.customer_id) ?? 0) + 1)
    if (row.is_active) {
      activeSiteCounts.set(row.customer_id, (activeSiteCounts.get(row.customer_id) ?? 0) + 1)
    }
  }

  const customerList = (customers ?? []).map((c) => ({
    ...c,
    siteCount: siteCounts.get(c.id) ?? 0,
    activeSiteCount: activeSiteCounts.get(c.id) ?? 0,
  })) as Customer[]
  const active = customerList.filter((c) => c.is_active)
  const archived = customerList.filter((c) => !c.is_active)

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-sm text-black/60">
          {canEdit
            ? 'Admin-only. Sites belong to a customer.'
            : 'Sites belong to a customer. Ask an admin to edit or archive one.'}
        </p>
      </div>

      <form
        action={createCustomer}
        className="space-y-3 rounded-lg border border-black/10 p-4"
      >
        <h2 className="font-medium">Add a customer</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium">
              Customer name
            </label>
            <input
              id="name"
              name="name"
              required
              className="w-full rounded-md border border-black/20 px-3 py-2"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="contact_person" className="text-sm font-medium">
              Contact person (optional)
            </label>
            <input
              id="contact_person"
              name="contact_person"
              className="w-full rounded-md border border-black/20 px-3 py-2"
            />
          </div>
        </div>
        <button
          type="submit"
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
        >
          Add customer
        </button>
      </form>

      <CustomerList
        title="Active customers"
        customers={active}
        emptyText="No active customers yet."
        canEdit={canEdit}
      />
      {archived.length > 0 && (
        <CustomerList title="Archived customers" customers={archived} emptyText="" canEdit={canEdit} />
      )}
    </div>
  )
}

function CustomerList({
  title,
  customers,
  emptyText,
  canEdit,
}: {
  title: string
  customers: Customer[]
  emptyText: string
  canEdit: boolean
}) {
  return (
    <div className="space-y-3">
      <h2 className="font-medium">{title}</h2>
      {customers.length === 0 && <p className="text-sm text-black/60">{emptyText}</p>}
      <ul className="divide-y divide-black/10 rounded-lg border border-black/10">
        {customers.map((customer) => (
          <li key={customer.id} className="flex items-center justify-between gap-4 p-3">
            <div>
              {canEdit ? (
                <Link href={`/timesheets/admin/customers/${customer.id}`} className="font-medium underline">
                  {customer.name}
                </Link>
              ) : (
                <p className="font-medium">{customer.name}</p>
              )}
              {customer.contact_person && (
                <p className="text-sm text-black/60">{customer.contact_person}</p>
              )}
              <p className="text-sm text-black/60">
                {customer.activeSiteCount === 0
                  ? 'No active sites'
                  : `${customer.activeSiteCount} active site${customer.activeSiteCount === 1 ? '' : 's'}`}
              </p>
            </div>
            {canEdit && (
              <div className="flex shrink-0 items-center gap-3">
                <form action={setCustomerActive.bind(null, customer.id, !customer.is_active)}>
                  <button type="submit" className="text-sm underline">
                    {customer.is_active ? 'Archive' : 'Restore'}
                  </button>
                </form>
                {!customer.is_active && customer.siteCount === 0 && (
                  <DeleteCustomerButton customerId={customer.id} />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
