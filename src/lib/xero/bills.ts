// Supplier bills in Xero become actual costs on the job they're for.
// Matched by, in order: the job's number, or one of its order numbers
// (Jobs -> a job -> Budget & costs), anywhere in the bill's Reference,
// number or line descriptions. The cost category comes from the supplier
// (Xero bills page); suppliers marked "leave out" (e.g. Amir Collins
// Painting Services, whose hours already cost from timesheets) are never
// added. Approved and paid bills count; voided or deleted ones come off.
// A bill already uploaded through Supplier invoices (same supplier invoice
// number) is skipped. Runs each morning and from "Check Xero now".
import { createAdminClient } from '@/lib/supabase/admin'
import { accountingGet, getXeroConnection } from './client'
import { jobKey } from './invoices'

type XeroBill = {
  InvoiceID: string
  InvoiceNumber: string | null
  Reference: string | null
  Status: string
  DateString: string
  SubTotal: number
  Contact: { Name: string } | null
  LineItems?: { Description?: string | null }[]
}

export type BillSyncResult = { added: number; updated: number; removed: number; unmatched: number; skipped: number; error?: string }

const COUNTS = new Set(['AUTHORISED', 'PAID'])
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

export async function syncXeroBills(): Promise<BillSyncResult> {
  const result: BillSyncResult = { added: 0, updated: 0, removed: 0, unmatched: 0, skipped: 0 }
  if (!(await getXeroConnection())) return { ...result, error: 'Xero is not connected.' }
  const db = createAdminClient()
  const { data: settings } = await db.from('xero_connection').select('invoices_since, bills_synced_at').eq('id', 1).single()
  const since = (settings?.invoices_since as string | null) ?? new Date().toISOString().slice(0, 10)
  const [y, m, d] = since.split('-').map(Number)

  const bills: XeroBill[] = []
  try {
    const where = encodeURIComponent(`Type=="ACCPAY" AND Date>=DateTime(${y},${m},${d})`)
    const modified: Record<string, string> = settings?.bills_synced_at
      ? { 'If-Modified-Since': new Date(Date.parse(settings.bills_synced_at as string) - 5 * 60_000).toUTCString() }
      : {}
    for (let page = 1; page < 50; page++) {
      const r = await accountingGet<{ Invoices: XeroBill[] }>(`/Invoices?where=${where}&page=${page}`, modified)
      bills.push(...(r.Invoices ?? []))
      if ((r.Invoices ?? []).length < 100) break
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not read Xero bills.'
    return { ...result, error: msg === 'MISSING_INVOICE_PERMISSION' ? 'Reconnect Xero to allow the Hub to read bills.' : msg }
  }
  const startedAt = new Date().toISOString()

  const [{ data: jobs }, { data: orders }, { data: suppliers }, { data: cats }, { data: links }, { data: uploaded }] = await Promise.all([
    db.from('jobs').select('id, job_number').not('job_number', 'is', null),
    db.from('job_order_numbers').select('job_id, order_number'),
    db.from('xero_supplier_settings').select('contact_name, category_id, excluded'),
    db.from('job_categories').select('id, key'),
    db.from('xero_unmatched_bills').select('xero_bill_id, job_id, overhead'),
    db.from('supplier_invoices').select('invoice_number'),
  ])
  const jobByKey = new Map((jobs ?? []).map((j) => [jobKey(j.job_number as string), j.id as string]))
  const orderList = (orders ?? []).map((o) => ({ key: norm(o.order_number as string), jobId: o.job_id as string })).filter((o) => o.key.length >= 3)
  const supplierOf = new Map((suppliers ?? []).map((s) => [norm(s.contact_name as string), s]))
  const otherCategory = (cats ?? []).find((c) => c.key === 'other')?.id as string | undefined
  const linkOf = new Map((links ?? []).map((l) => [l.xero_bill_id as string, l]))
  const alreadyUploaded = new Set((uploaded ?? []).map((u) => norm(u.invoice_number as string)).filter(Boolean))

  const findJob = (b: XeroBill): string | undefined => {
    const texts = [b.Reference, b.InvoiceNumber, ...(b.LineItems ?? []).map((l) => l.Description)]
    for (const t of texts) {
      const j = jobByKey.get(jobKey(t) ?? '')
      if (j) return j
    }
    const hay = norm(texts.join(' '))
    return orderList.find((o) => hay.includes(o.key))?.jobId
  }

  // New suppliers appear on the Xero bills page to give a category.
  const newSuppliers = [...new Set(bills.map((b) => b.Contact?.Name).filter((n): n is string => !!n && !supplierOf.has(norm(n))))]
  if (newSuppliers.length) {
    await db.from('xero_supplier_settings').upsert(newSuppliers.map((n) => ({ contact_name: n })), { onConflict: 'contact_name', ignoreDuplicates: true })
  }

  for (const b of bills) {
    const supplier = supplierOf.get(norm(b.Contact?.Name))
    const { data: existing } = await db.from('job_actual_costs').select('id').eq('xero_bill_id', b.InvoiceID).maybeSingle()
    const remove = async () => {
      if (existing) {
        await db.from('job_actual_costs').delete().eq('id', existing.id)
        result.removed++
      }
    }

    if (!COUNTS.has(b.Status) || supplier?.excluded) {
      await remove()
      if (supplier?.excluded) result.skipped++
      if (b.Status === 'VOIDED' || b.Status === 'DELETED') await db.from('xero_unmatched_bills').delete().eq('xero_bill_id', b.InvoiceID)
      continue
    }
    // Already on the job through Supplier invoices (e.g. a Resene upload).
    if (!existing && b.InvoiceNumber && alreadyUploaded.has(norm(b.InvoiceNumber))) {
      result.skipped++
      continue
    }

    const link = linkOf.get(b.InvoiceID)
    const matched = findJob(b)
    const jobId = matched ?? (link?.job_id as string | undefined)
    if (!jobId) {
      await remove()
      if (!link?.overhead) {
        await db.from('xero_unmatched_bills').upsert({
          xero_bill_id: b.InvoiceID,
          bill_number: b.InvoiceNumber,
          reference: b.Reference,
          contact_name: b.Contact?.Name ?? null,
          bill_date: b.DateString.slice(0, 10),
          subtotal: b.SubTotal,
          status: b.Status,
          updated_at: new Date().toISOString(),
        })
        result.unmatched++
      }
      continue
    }

    const row = {
      job_id: jobId,
      category_id: (supplier?.category_id as string | null) ?? otherCategory ?? null,
      description: `${b.Contact?.Name ?? 'Supplier'} bill ${b.InvoiceNumber ?? ''}`.trim(),
      amount: b.SubTotal,
      source: 'xero_bill',
      incurred_at: b.DateString.slice(0, 10),
      xero_bill_id: b.InvoiceID,
    }
    if (existing) {
      await db.from('job_actual_costs').update(row).eq('id', existing.id)
      result.updated++
    } else {
      await db.from('job_actual_costs').insert(row)
      result.added++
    }
    if (link && matched) await db.from('xero_unmatched_bills').delete().eq('xero_bill_id', b.InvoiceID)
  }

  await db.from('xero_connection').update({ bills_synced_at: startedAt }).eq('id', 1)
  return result
}

// Hand-pick the job for an unmatched bill (kept, so changes in Xero follow).
export async function linkUnmatchedBill(xeroBillId: string, jobId: string | null) {
  const db = createAdminClient()
  const { data: b } = await db.from('xero_unmatched_bills').select('*').eq('xero_bill_id', xeroBillId).single()
  if (!b) return
  if (!jobId) {
    await db.from('xero_unmatched_bills').update({ overhead: true, updated_at: new Date().toISOString() }).eq('xero_bill_id', xeroBillId)
    return
  }
  const [{ data: supplier }, { data: other }] = await Promise.all([
    db.from('xero_supplier_settings').select('category_id').eq('contact_name', b.contact_name ?? '').maybeSingle(),
    db.from('job_categories').select('id').eq('key', 'other').maybeSingle(),
  ])
  await db.from('job_actual_costs').upsert(
    {
      job_id: jobId,
      category_id: (supplier?.category_id as string | null) ?? (other?.id as string | null) ?? null,
      description: `${b.contact_name ?? 'Supplier'} bill ${b.bill_number ?? ''}`.trim(),
      amount: b.subtotal,
      source: 'xero_bill',
      incurred_at: b.bill_date,
      xero_bill_id: xeroBillId,
    },
    { onConflict: 'xero_bill_id' }
  )
  await db.from('xero_unmatched_bills').update({ job_id: jobId, updated_at: new Date().toISOString() }).eq('xero_bill_id', xeroBillId)
}

// A supplier's category changed: move their existing bill lines too.
export async function setSupplierSetting(contactName: string, categoryId: string | null, excluded: boolean) {
  const db = createAdminClient()
  await db.from('xero_supplier_settings').upsert({ contact_name: contactName, category_id: categoryId, excluded, updated_at: new Date().toISOString() })
  if (categoryId && !excluded) {
    await db.from('job_actual_costs').update({ category_id: categoryId }).eq('source', 'xero_bill').like('description', `${contactName} bill%`)
  }
  if (excluded) {
    await db.from('job_actual_costs').delete().eq('source', 'xero_bill').like('description', `${contactName} bill%`)
  }
}
