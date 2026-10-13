// Customer invoices raised in Xero become claims on the job they're for -
// the job number goes in the invoice's Reference (e.g. "26-056" or
// "PP-26-056"). Approved and paid invoices are claims; drafts are ignored
// until approved; voided or deleted ones are taken off. Invoices that don't
// name a job wait on the Unmatched Xero invoices page. When every invoice
// on an Invoiced job is paid and it's fully claimed, the job moves to Paid.
// Runs each morning (/api/cron/daily) and from "Check Xero now".
import { createAdminClient } from '@/lib/supabase/admin'
import { accountingGet, getXeroConnection } from './client'
import { fetchVariations, groupBy, variationTotals } from '@/lib/jobs/jobFinance'

type XeroInvoice = {
  InvoiceID: string
  InvoiceNumber: string | null
  Reference: string | null
  Type: string
  Status: string
  DateString: string
  SubTotal: number
  AmountDue: number
  Contact: { Name: string } | null
}

export type SyncResult = { added: number; updated: number; removed: number; unmatched: number; paidJobs: number; error?: string }

// "PP-26-056", "26-056", "Job 26 056" -> "26-056".
export function jobKey(text: string | null | undefined): string | null {
  const m = (text ?? '').match(/(\d{2})\s*[-–/ ]\s*(\d{3})/)
  return m ? `${m[1]}-${m[2]}` : null
}

const COUNTS = new Set(['AUTHORISED', 'PAID'])

export async function syncXeroInvoices(): Promise<SyncResult> {
  const result: SyncResult = { added: 0, updated: 0, removed: 0, unmatched: 0, paidJobs: 0 }
  const conn = await getXeroConnection()
  if (!conn) return { ...result, error: 'Xero is not connected.' }
  const db = createAdminClient()
  const { data: settings } = await db.from('xero_connection').select('invoices_since, invoices_synced_at').eq('id', 1).single()
  const since = (settings?.invoices_since as string | null) ?? new Date().toISOString().slice(0, 10)
  const [y, m, d] = since.split('-').map(Number)

  // Everything changed since the last check (the first time: all from `since`).
  const invoices: XeroInvoice[] = []
  try {
    const where = encodeURIComponent(`Type=="ACCREC" AND Date>=DateTime(${y},${m},${d})`)
    const modified: Record<string, string> = settings?.invoices_synced_at
      ? { 'If-Modified-Since': new Date(Date.parse(settings.invoices_synced_at as string) - 5 * 60_000).toUTCString() }
      : {}
    for (let page = 1; page < 50; page++) {
      const r = await accountingGet<{ Invoices: XeroInvoice[] }>(`/Invoices?where=${where}&page=${page}&summaryOnly=true`, modified)
      invoices.push(...(r.Invoices ?? []))
      if ((r.Invoices ?? []).length < 100) break
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not read Xero invoices.'
    return { ...result, error: msg === 'MISSING_INVOICE_PERMISSION' ? 'Reconnect Xero to allow the Hub to read invoices.' : msg }
  }
  const startedAt = new Date().toISOString()

  const [{ data: jobs }, { data: links }] = await Promise.all([
    db.from('jobs').select('id, job_number').not('job_number', 'is', null),
    db.from('xero_unmatched_invoices').select('xero_invoice_id, job_id, dismissed'),
  ])
  const jobByKey = new Map((jobs ?? []).map((j) => [jobKey(j.job_number as string), j.id as string]))
  const linked = new Map((links ?? []).map((l) => [l.xero_invoice_id as string, l]))
  const touchedJobs = new Set<string>()

  for (const inv of invoices) {
    const link = linked.get(inv.InvoiceID)
    const byReference = jobByKey.get(jobKey(inv.Reference) ?? '') ?? jobByKey.get(jobKey(inv.InvoiceNumber) ?? '')
    // Named in the invoice, else picked by hand on the Unmatched page.
    const jobId = byReference ?? (link?.job_id as string | undefined)
    const { data: existing } = await db.from('job_claims').select('id, job_id').eq('xero_invoice_id', inv.InvoiceID).maybeSingle()

    if (!COUNTS.has(inv.Status)) {
      // Draft, voided or deleted: not (or no longer) a claim.
      if (existing) {
        await db.from('job_claims').delete().eq('id', existing.id)
        touchedJobs.add(existing.job_id as string)
        result.removed++
      }
      if (inv.Status === 'VOIDED' || inv.Status === 'DELETED') await db.from('xero_unmatched_invoices').delete().eq('xero_invoice_id', inv.InvoiceID)
      continue
    }

    if (!jobId) {
      if (!link?.dismissed) {
        await db.from('xero_unmatched_invoices').upsert({
          xero_invoice_id: inv.InvoiceID,
          invoice_number: inv.InvoiceNumber,
          reference: inv.Reference,
          contact_name: inv.Contact?.Name ?? null,
          invoice_date: inv.DateString.slice(0, 10),
          subtotal: inv.SubTotal,
          status: inv.Status,
          updated_at: new Date().toISOString(),
        })
        result.unmatched++
      }
      continue
    }

    const row = {
      job_id: jobId,
      claim_date: inv.DateString.slice(0, 10),
      reference: inv.InvoiceNumber,
      amount: inv.SubTotal,
      notes: `From Xero${inv.Reference ? ` · ${inv.Reference}` : ''}`,
      xero_invoice_id: inv.InvoiceID,
      xero_status: inv.AmountDue <= 0 ? 'PAID' : inv.Status,
    }
    if (existing) {
      await db.from('job_claims').update(row).eq('id', existing.id)
      if (existing.job_id !== jobId) touchedJobs.add(existing.job_id as string)
      result.updated++
    } else {
      await db.from('job_claims').insert(row)
      result.added++
    }
    touchedJobs.add(jobId)
    // Now named in the invoice itself - the hand-picked link isn't needed.
    if (link && byReference) await db.from('xero_unmatched_invoices').delete().eq('xero_invoice_id', inv.InvoiceID)
  }

  result.paidJobs = await markPaidJobs([...touchedJobs])
  await db.from('xero_connection').update({ invoices_synced_at: startedAt }).eq('id', 1)
  return result
}

// Jobs fully claimed through Xero (quote + approved variations) move along
// by themselves: Job completed -> Invoiced, and once every one of those
// invoices is paid in Xero, Invoiced -> Paid.
async function markPaidJobs(jobIds: string[]): Promise<number> {
  if (jobIds.length === 0) return 0
  const db = createAdminClient()
  const { data: jobs } = await db.from('jobs').select('id, status, quoted_sell_total').in('id', jobIds).in('status', ['complete', 'invoiced'])
  if (!jobs?.length) return 0
  const ids = jobs.map((j) => j.id as string)
  const [{ data: claims }, variations] = await Promise.all([
    db.from('job_claims').select('job_id, amount, xero_invoice_id, xero_status').in('job_id', ids),
    fetchVariations(db, ids),
  ])
  const claimsBy = groupBy(claims ?? [], (c) => c.job_id as string)
  const varsBy = groupBy(variations, (v) => v.job_id)
  let n = 0
  for (const j of jobs) {
    const cs = claimsBy.get(j.id as string) ?? []
    const fromXero = cs.filter((c) => c.xero_invoice_id)
    const contract = Number(j.quoted_sell_total ?? 0) + variationTotals(varsBy.get(j.id as string) ?? []).approvedAmount
    const claimed = cs.reduce((s, c) => s + Number(c.amount), 0)
    if (!fromXero.length || contract <= 0 || claimed < contract - 1) continue
    const allPaid = fromXero.every((c) => c.xero_status === 'PAID')
    const next = allPaid ? 'paid' : j.status === 'complete' ? 'invoiced' : null
    if (next) {
      await db.from('jobs').update({ status: next }).eq('id', j.id)
      if (next === 'paid') n++
    }
  }
  return n
}

// Link an unmatched Xero invoice to a job (then sync it in).
export async function linkUnmatchedInvoice(xeroInvoiceId: string, jobId: string) {
  const db = createAdminClient()
  const { data: u } = await db.from('xero_unmatched_invoices').select('*').eq('xero_invoice_id', xeroInvoiceId).single()
  if (!u) return
  await db.from('job_claims').upsert(
    {
      job_id: jobId,
      claim_date: u.invoice_date,
      reference: u.invoice_number,
      amount: u.subtotal,
      notes: `From Xero${u.reference ? ` · ${u.reference}` : ''}`,
      xero_invoice_id: xeroInvoiceId,
      xero_status: u.status,
    },
    { onConflict: 'xero_invoice_id' }
  )
  // Kept (with its job) so later changes in Xero follow it.
  await db.from('xero_unmatched_invoices').update({ job_id: jobId, updated_at: new Date().toISOString() }).eq('xero_invoice_id', xeroInvoiceId)
  await markPaidJobs([jobId])
}
