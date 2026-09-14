import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { updateSite, addSiteDocument, deleteSiteDocument } from '@/lib/timesheets/actions/sites'
import { requireAdminOrSupervisor } from '@/lib/timesheets/authGuards'

export default async function EditSitePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const profile = await requireAdminOrSupervisor()
  const canEdit = profile.role === 'admin'

  const { id } = await params
  const supabase = await createClient()

  const [{ data: site }, { data: customers }, { data: extraDocs }, { data: jobs }] =
    await Promise.all([
      supabase
        .from('sites')
        .select(
          'id, customer_id, name, address, contact_person, job_id, extent_of_work_filename, safety_plan_filename'
        )
        .eq('id', id)
        .single(),
      supabase.from('customers').select('id, name').order('name'),
      supabase
        .from('site_documents')
        .select('id, name')
        .eq('site_id', id)
        .order('created_at'),
      // Jobs is admin-only RLS in the Hub — this page is already
      // admin-only (canEdit), so the plain session client can read it.
      supabase.from('jobs').select('id, name, job_number').order('name'),
    ])

  if (!site) {
    notFound()
  }

  return (
    <div className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">{canEdit ? 'Edit site' : site.name}</h1>

      {canEdit ? (
        <form id="site-form" action={updateSite.bind(null, site.id)} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="customer_id" className="text-sm font-medium">
              Customer
            </label>
            <select
              id="customer_id"
              name="customer_id"
              defaultValue={site.customer_id}
              required
              className="w-full rounded-md border border-black/20 px-3 py-2"
            >
              {(customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="name" className="text-sm font-medium">
              Site name
            </label>
            <input
              id="name"
              name="name"
              defaultValue={site.name}
              required
              className="w-full rounded-md border border-black/20 px-3 py-2"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="address" className="text-sm font-medium">
              Address (optional)
            </label>
            <input
              id="address"
              name="address"
              defaultValue={site.address ?? ''}
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
              defaultValue={site.contact_person ?? ''}
              className="w-full rounded-md border border-black/20 px-3 py-2"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="job_id" className="text-sm font-medium">
              Job
              {!site.job_id && (
                <span className="ml-1 text-red-600">— needs linking, site won&apos;t appear at clock-in until it&apos;s set</span>
              )}
            </label>
            <select
              id="job_id"
              name="job_id"
              defaultValue={site.job_id ?? ''}
              required
              className="w-full rounded-md border border-black/20 px-3 py-2"
            >
              {!site.job_id && <option value="">Choose a job…</option>}
              {(jobs ?? []).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_number ? `${j.job_number} — ${j.name}` : j.name}
                </option>
              ))}
            </select>
          </div>
          <SiteDocumentField
            kind="extent-of-work"
            label="Extent of Work"
            siteId={site.id}
            currentFilename={site.extent_of_work_filename}
            inputName="extent_of_work"
            removeName="remove_extent_of_work"
            canRemove={canEdit}
          />
          <SiteDocumentField
            kind="safety-plan"
            label="Site Safety Plan"
            siteId={site.id}
            currentFilename={site.safety_plan_filename}
            inputName="safety_plan"
            removeName="remove_safety_plan"
            canRemove={canEdit}
          />
        </form>
      ) : (
        <div className="space-y-3 rounded-lg border border-black/10 p-4 text-sm">
          {site.address && <p className="text-black/60">{site.address}</p>}
          {(site.extent_of_work_filename || site.safety_plan_filename) && (
            <div className="flex gap-2">
              {site.extent_of_work_filename && (
                <a
                  href={`/api/timesheets/site-documents/${site.id}/extent-of-work`}
                  target="_blank"
                  className="rounded bg-black/5 px-2 py-1 underline"
                >
                  Extent of Work
                </a>
              )}
              {site.safety_plan_filename && (
                <a
                  href={`/api/timesheets/site-documents/${site.id}/safety-plan`}
                  target="_blank"
                  className="rounded bg-black/5 px-2 py-1 underline"
                >
                  Safety Plan
                </a>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-black/10 p-4">
        <h2 className="font-medium">Additional documents</h2>
        <p className="text-sm text-black/60">
          Any other PDFs for this site - name them whatever makes sense.
        </p>

        {(extraDocs ?? []).length > 0 && (
          <ul className="divide-y divide-black/10 rounded-lg border border-black/10">
            {(extraDocs ?? []).map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <a
                  href={`/api/timesheets/site-documents/doc/${doc.id}`}
                  target="_blank"
                  className="underline"
                >
                  {doc.name}
                </a>
                {canEdit && (
                  <form action={deleteSiteDocument.bind(null, doc.id, site.id)}>
                    <button type="submit" className="text-sm text-red-600 underline">
                      Delete
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        <form
          action={addSiteDocument.bind(null, site.id)}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <div className="flex-1 space-y-1">
            <label htmlFor="doc_name" className="text-sm font-medium">
              Name
            </label>
            <input
              id="doc_name"
              name="name"
              placeholder="e.g. Council Consent"
              required
              className="w-full rounded-md border border-black/20 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label htmlFor="doc_file" className="text-sm font-medium">
              File (PDF)
            </label>
            <input
              id="doc_file"
              name="file"
              type="file"
              accept="application/pdf"
              required
              className="w-full rounded-md border border-black/20 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-black/20 px-4 py-2 text-sm font-medium hover:bg-black/5"
          >
            Add document
          </button>
        </form>
      </div>

      {canEdit && (
        <button
          type="submit"
          form="site-form"
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
        >
          Save changes
        </button>
      )}
    </div>
  )
}

function SiteDocumentField({
  kind,
  label,
  siteId,
  currentFilename,
  inputName,
  removeName,
  canRemove,
}: {
  kind: 'extent-of-work' | 'safety-plan'
  label: string
  siteId: string
  currentFilename: string | null
  inputName: string
  removeName: string
  canRemove: boolean
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={inputName} className="text-sm font-medium">
        {label} (PDF, optional)
      </label>
      {currentFilename && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-black/10 bg-black/5 px-3 py-2 text-sm">
          <a
            href={`/api/timesheets/site-documents/${siteId}/${kind}`}
            target="_blank"
            className="underline"
          >
            {currentFilename}
          </a>
          {canRemove && (
            <label className="flex items-center gap-1 text-xs text-black/60">
              <input type="checkbox" name={removeName} />
              Remove
            </label>
          )}
        </div>
      )}
      <input
        id={inputName}
        name={inputName}
        type="file"
        accept="application/pdf"
        className="w-full rounded-md border border-black/20 px-3 py-2 text-sm"
      />
      {currentFilename && (
        <p className="text-xs text-black/50">Uploading a new file replaces the current one.</p>
      )}
    </div>
  )
}
