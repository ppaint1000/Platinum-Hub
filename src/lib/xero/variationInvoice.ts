// An approved variation becomes a DRAFT invoice in Xero for the job's
// client, with the job number in the Reference - check it, add the account
// code if Xero asks, and approve and send it there. Once approved in Xero it
// comes back as a claim on the job (lib/xero/invoices.ts). Never throws.
import { createAdminClient } from '@/lib/supabase/admin'
import { accountingGet, accountingPost, getXeroConnection } from './client'

export async function draftInvoiceForVariation(variationId: string): Promise<{ ok: boolean; message: string }> {
  try {
    if (!(await getXeroConnection())) return { ok: false, message: 'Xero is not connected.' }
    const db = createAdminClient()
    const { data: v } = await db
      .from('job_variations')
      .select('id, reference, name, amount, status, xero_invoice_id, job:jobs(job_number, name, client:clients(name))')
      .eq('id', variationId)
      .single()
    if (!v || v.status !== 'approved') return { ok: false, message: 'Not approved.' }
    if (v.xero_invoice_id) return { ok: true, message: 'Already in Xero.' }
    if (!Number(v.amount)) return { ok: false, message: 'No price on the variation - nothing to invoice.' }

    const job = (Array.isArray(v.job) ? v.job[0] : v.job) as { job_number: string | null; name: string; client: { name: string } | { name: string }[] | null } | null
    const client = Array.isArray(job?.client) ? job?.client[0] : job?.client
    if (!client?.name) return { ok: false, message: 'The job has no client - invoice it in Xero by hand.' }

    const where = encodeURIComponent(`Name=="${client.name.replace(/"/g, '\\"')}"`)
    const contacts = await accountingGet<{ Contacts: { ContactID: string }[] }>(`/Contacts?where=${where}`)
    const contactId = contacts.Contacts?.[0]?.ContactID
    if (!contactId) return { ok: false, message: `No Xero contact called "${client.name}" - add it in Xero (same name) or invoice by hand.` }

    const created = await accountingPost<{ Invoices: { InvoiceID: string; InvoiceNumber?: string }[] }>('/Invoices', {
      Invoices: [
        {
          Type: 'ACCREC',
          Status: 'DRAFT',
          Contact: { ContactID: contactId },
          Reference: job?.job_number ?? undefined,
          LineAmountTypes: 'Exclusive',
          LineItems: [
            {
              Description: `Variation ${v.reference ?? ''} - ${v.name}${job ? ` (${job.job_number ?? ''} ${job.name})` : ''}`.replace(/\s+/g, ' ').trim(),
              Quantity: 1,
              UnitAmount: Number(v.amount),
            },
          ],
        },
      ],
    })
    const invoiceId = created.Invoices?.[0]?.InvoiceID
    if (invoiceId) await db.from('job_variations').update({ xero_invoice_id: invoiceId }).eq('id', variationId)
    return { ok: true, message: `Draft invoice created in Xero for ${client.name}.` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not create the Xero invoice.'
    return { ok: false, message: msg === 'MISSING_INVOICE_PERMISSION' ? 'Reconnect Xero to allow draft invoices.' : msg }
  }
}
