'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, requireAdminOrSupervisor } from '@/lib/timesheets/authGuards'
import {
  SITE_DOCUMENT_COLUMN,
  siteDocumentPath,
  type SiteDocumentKind,
} from '@/lib/timesheets/siteDocuments'

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function uploadSiteDocument(
  supabase: SupabaseServerClient,
  siteId: string,
  kind: SiteDocumentKind,
  file: File
): Promise<string | null> {
  if (file.size === 0) return null
  if (file.type !== 'application/pdf') {
    return `${kind === 'extent-of-work' ? 'Extent of Work' : 'Site Safety Plan'} must be a PDF file.`
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `${kind === 'extent-of-work' ? 'Extent of Work' : 'Site Safety Plan'} must be under 15MB.`
  }

  const { error: uploadError } = await supabase.storage
    .from('site-documents')
    .upload(siteDocumentPath(siteId, kind), file, {
      contentType: 'application/pdf',
      upsert: true,
    })
  if (uploadError) return uploadError.message

  await supabase
    .from('sites')
    .update({ [SITE_DOCUMENT_COLUMN[kind]]: file.name })
    .eq('id', siteId)

  return null
}

export async function createSite(formData: FormData) {
  await requireAdminOrSupervisor()

  const customer_id = formData.get('customer_id')
  const name = formData.get('name')
  const address = formData.get('address')
  const contact_person = formData.get('contact_person')
  const extentOfWork = formData.get('extent_of_work')
  const safetyPlan = formData.get('safety_plan')

  if (typeof customer_id !== 'string' || !customer_id) return
  if (typeof name !== 'string' || !name.trim()) return

  const supabase = await createClient()
  const { data: site } = await supabase
    .from('sites')
    .insert({
      customer_id,
      name: name.trim(),
      address: typeof address === 'string' && address.trim() ? address.trim() : null,
      contact_person:
        typeof contact_person === 'string' && contact_person.trim()
          ? contact_person.trim()
          : null,
    })
    .select('id')
    .single()

  if (site) {
    if (extentOfWork instanceof File) {
      await uploadSiteDocument(supabase, site.id, 'extent-of-work', extentOfWork)
    }
    if (safetyPlan instanceof File) {
      await uploadSiteDocument(supabase, site.id, 'safety-plan', safetyPlan)
    }

    await createLinkedJobForSite(site.id, name.trim())
  }

  revalidatePath('/timesheets/admin/sites')
  revalidatePath('/timesheets/admin/customers/[id]', 'page')
}

// Every site needs a matching Hub job. Inserted as 'won' first so the
// assign_job_number() trigger fires, then flipped to 'in_progress' so it's
// immediately clockable — see sites_jobs_link_schema.sql. Now that this runs
// inside the Hub itself, this is a same-app service-role write to the same
// jobs table Jobs/Orders/Sales already read — not a cross-app call anymore.
async function createLinkedJobForSite(siteId: string, siteName: string) {
  const admin = createAdminClient()

  const { data: job, error: insertError } = await admin
    .from('jobs')
    .insert({ name: siteName, status: 'won' })
    .select('id')
    .single()
  if (insertError || !job) return

  await admin.from('jobs').update({ status: 'in_progress' }).eq('id', job.id)
  await admin.from('sites').update({ job_id: job.id }).eq('id', siteId)
}

export async function updateSite(siteId: string, formData: FormData) {
  await requireAdmin()

  const customer_id = formData.get('customer_id')
  const name = formData.get('name')
  const address = formData.get('address')
  const contact_person = formData.get('contact_person')
  const job_id = formData.get('job_id')
  const extentOfWork = formData.get('extent_of_work')
  const safetyPlan = formData.get('safety_plan')
  const removeExtentOfWork = formData.get('remove_extent_of_work') === 'on'
  const removeSafetyPlan = formData.get('remove_safety_plan') === 'on'

  if (typeof customer_id !== 'string' || !customer_id) return
  if (typeof name !== 'string' || !name.trim()) return

  const supabase = await createClient()
  await supabase
    .from('sites')
    .update({
      customer_id,
      name: name.trim(),
      address: typeof address === 'string' && address.trim() ? address.trim() : null,
      contact_person:
        typeof contact_person === 'string' && contact_person.trim()
          ? contact_person.trim()
          : null,
      ...(typeof job_id === 'string' && job_id ? { job_id } : {}),
    })
    .eq('id', siteId)

  if (extentOfWork instanceof File && extentOfWork.size > 0) {
    await uploadSiteDocument(supabase, siteId, 'extent-of-work', extentOfWork)
  } else if (removeExtentOfWork) {
    await supabase.storage.from('site-documents').remove([siteDocumentPath(siteId, 'extent-of-work')])
    await supabase.from('sites').update({ extent_of_work_filename: null }).eq('id', siteId)
  }

  if (safetyPlan instanceof File && safetyPlan.size > 0) {
    await uploadSiteDocument(supabase, siteId, 'safety-plan', safetyPlan)
  } else if (removeSafetyPlan) {
    await supabase.storage.from('site-documents').remove([siteDocumentPath(siteId, 'safety-plan')])
    await supabase.from('sites').update({ safety_plan_filename: null }).eq('id', siteId)
  }

  revalidatePath('/timesheets/admin/sites')
  redirect('/timesheets/admin/sites')
}

export async function setSiteActive(siteId: string, isActive: boolean) {
  await requireAdmin()

  const supabase = await createClient()
  await supabase.from('sites').update({ is_active: isActive }).eq('id', siteId)

  revalidatePath('/timesheets/admin/sites')
}

// Only for sites with zero timesheet entries - anyone with logged hours
// needs to stay, since deleting cascades and would wipe that history. The
// UI only offers this for already-archived sites, same pattern as
// deleteCustomer/deleteStaff.
//
// Every step's result is checked and surfaced — this used to fail
// completely silently (no error returned, nothing logged) whenever the
// final delete affected zero rows, which is exactly what happens if RLS
// blocks it: a blocked DELETE isn't an error in Postgres, it's just a
// no-op. The UI now shows whatever comes back instead of pretending it
// worked.
export async function deleteSite(siteId: string): Promise<{ error?: string }> {
  await requireAdmin()

  const supabase = await createClient()
  const { count, error: countError } = await supabase
    .from('timesheet_entries')
    .select('id', { count: 'exact', head: true })
    .eq('site_id', siteId)

  if (countError) return { error: countError.message }
  if ((count ?? 0) > 0) {
    return { error: `${count} timesheet ${count === 1 ? 'entry' : 'entries'} reference this site — can't delete.` }
  }

  await supabase.storage.from('site-documents').remove([
    siteDocumentPath(siteId, 'extent-of-work'),
    siteDocumentPath(siteId, 'safety-plan'),
  ])
  const { data: extraDocs } = await supabase
    .from('site_documents')
    .select('storage_path')
    .eq('site_id', siteId)
  if (extraDocs && extraDocs.length > 0) {
    await supabase.storage.from('site-documents').remove(extraDocs.map((d) => d.storage_path))
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('sites')
    .delete()
    .eq('id', siteId)
    .select('id')

  if (deleteError) return { error: deleteError.message }
  if (!deleted || deleted.length === 0) {
    return { error: "Delete didn't go through — you may not have permission to delete this site." }
  }

  revalidatePath('/timesheets/admin/sites')
  return {}
}

// Any number of additional named documents per site, on top of the two
// fixed ones (Extent of Work, Site Safety Plan) - no default name, admin
// picks whatever label makes sense (e.g. "Council Consent", "Colour Schedule").
export async function addSiteDocument(siteId: string, formData: FormData) {
  await requireAdminOrSupervisor()

  const name = formData.get('name')
  const file = formData.get('file')

  if (typeof name !== 'string' || !name.trim()) return
  if (!(file instanceof File) || file.size === 0) return
  if (file.type !== 'application/pdf') return
  if (file.size > MAX_DOCUMENT_BYTES) return

  const supabase = await createClient()
  const storagePath = `${siteId}/extra/${crypto.randomUUID()}.pdf`

  const { error: uploadError } = await supabase.storage
    .from('site-documents')
    .upload(storagePath, file, { contentType: 'application/pdf' })
  if (uploadError) return

  await supabase.from('site_documents').insert({
    site_id: siteId,
    name: name.trim(),
    storage_path: storagePath,
  })

  revalidatePath(`/timesheets/admin/sites/${siteId}`)
}

export async function deleteSiteDocument(documentId: string, siteId: string) {
  await requireAdmin()

  const supabase = await createClient()
  const { data: doc } = await supabase
    .from('site_documents')
    .select('storage_path')
    .eq('id', documentId)
    .single()

  if (doc) {
    await supabase.storage.from('site-documents').remove([doc.storage_path])
    await supabase.from('site_documents').delete().eq('id', documentId)
  }

  revalidatePath(`/timesheets/admin/sites/${siteId}`)
}
