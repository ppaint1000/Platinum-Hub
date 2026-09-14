import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateCustomer } from '@/lib/timesheets/actions/customers'
import { createSite } from '@/lib/timesheets/actions/sites'
import { requireAdmin } from '@/lib/timesheets/authGuards'

type SiteRow = {
  id: string
  name: string
  address: string | null
  contact_person: string | null
  is_active: boolean
}

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()

  const { id } = await params
  const supabase = await createClient()

  const [{ data: customer }, { data: sites }] = await Promise.all([
    supabase.from('customers').select('id, name, contact_person').eq('id', id).single(),
    supabase
      .from('sites')
      .select('id, name, address, contact_person, is_active')
      .eq('customer_id', id)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true })
      .returns<SiteRow[]>(),
  ])

  if (!customer) {
    notFound()
  }

  const siteList = sites ?? []

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Edit customer</h1>
        <form action={updateCustomer.bind(null, customer.id)} className="mt-4 space-y-3">
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium">
              Customer name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={customer.name}
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
              defaultValue={customer.contact_person ?? ''}
              className="w-full rounded-md border border-black/20 px-3 py-2"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm text-white"
          >
            Save changes
          </button>
        </form>
      </div>

      <details className="rounded-lg border border-black/10" open>
        <summary className="cursor-pointer select-none px-4 py-3 font-medium">
          Sites ({siteList.length})
        </summary>
        <div className="space-y-4 border-t border-black/10 p-4">
          <form
            action={createSite}
            className="space-y-3 rounded-lg border border-black/10 p-4"
          >
            <input type="hidden" name="customer_id" value={customer.id} />
            <h3 className="font-medium">Add a site</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="site_name" className="text-sm font-medium">
                  Site name
                </label>
                <input
                  id="site_name"
                  name="name"
                  required
                  className="w-full rounded-md border border-black/20 px-3 py-2"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="site_address" className="text-sm font-medium">
                  Address (optional)
                </label>
                <input
                  id="site_address"
                  name="address"
                  className="w-full rounded-md border border-black/20 px-3 py-2"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="site_contact_person" className="text-sm font-medium">
                Contact person (optional)
              </label>
              <input
                id="site_contact_person"
                name="contact_person"
                className="w-full rounded-md border border-black/20 px-3 py-2"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor="site_extent_of_work" className="text-sm font-medium">
                  Extent of Work (PDF, optional)
                </label>
                <input
                  id="site_extent_of_work"
                  name="extent_of_work"
                  type="file"
                  accept="application/pdf"
                  className="w-full rounded-md border border-black/20 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="site_safety_plan" className="text-sm font-medium">
                  Site Safety Plan (PDF, optional)
                </label>
                <input
                  id="site_safety_plan"
                  name="safety_plan"
                  type="file"
                  accept="application/pdf"
                  className="w-full rounded-md border border-black/20 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded-md bg-black px-4 py-2 text-sm text-white"
            >
              Add site
            </button>
          </form>

          {siteList.length === 0 ? (
            <p className="text-sm text-black/60">No sites for this customer yet.</p>
          ) : (
            <ul className="divide-y divide-black/10 rounded-lg border border-black/10">
              {siteList.map((site) => (
                <li key={site.id} className="flex items-center justify-between gap-4 p-3">
                  <div>
                    <Link
                      href={`/timesheets/admin/sites/${site.id}`}
                      className="font-medium underline"
                    >
                      {site.name}
                    </Link>
                    {(site.address || site.contact_person) && (
                      <p className="text-sm text-black/60">
                        {[site.address, site.contact_person].filter(Boolean).join(' — ')}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      site.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-black/10 text-black/60'
                    }`}
                  >
                    {site.is_active ? 'Active' : 'Inactive'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  )
}
