// The Hub's connection to Xero (Payroll NZ). OAuth 2 with the "Platinum
// Hub" app registered at developer.xero.com - its keys are the Vercel
// settings XERO_CLIENT_ID and XERO_CLIENT_SECRET. Tokens live in
// xero_connection (service role only) and are refreshed here as needed.
// Server-side only.
import { createAdminClient } from '@/lib/supabase/admin'

const AUTHORIZE_URL = 'https://login.xero.com/identity/connect/authorize'
const TOKEN_URL = 'https://identity.xero.com/connect/token'
const CONNECTIONS_URL = 'https://api.xero.com/connections'
const PAYROLL_NZ = 'https://api.xero.com/payroll.xro/2.0'

// Read employees and pay settings, write timesheets; offline_access keeps
// the connection going without signing in again.
export const XERO_SCOPES = 'openid profile email offline_access payroll.employees.read payroll.timesheets payroll.settings.read'

export type XeroConnection = {
  tenant_id: string
  tenant_name: string | null
  access_token: string
  refresh_token: string
  expires_at: string
  earnings_rate_id: string | null
  earnings_rate_name: string | null
  connected_at: string
}

export const xeroConfigured = () => !!(process.env.XERO_CLIENT_ID && process.env.XERO_CLIENT_SECRET)

export const xeroRedirectUri = (origin: string) => `${origin}/api/xero/callback`

export function xeroAuthorizeUrl(origin: string, state: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.XERO_CLIENT_ID ?? '',
    redirect_uri: xeroRedirectUri(origin),
    scope: XERO_SCOPES,
    state,
  })
  return `${AUTHORIZE_URL}?${params}`
}

function basicAuth() {
  return 'Basic ' + Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Xero sign-in failed: ${json.error ?? res.status}`)
  return json as { access_token: string; refresh_token: string; expires_in: number }
}

// After "Allow" in Xero: swap the code for tokens and remember the organisation.
export async function completeXeroConnection(code: string, origin: string, userId: string) {
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: xeroRedirectUri(origin) })
  const conns = await fetch(CONNECTIONS_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
  }).then((r) => r.json() as Promise<{ tenantId: string; tenantName: string; tenantType: string }[]>)
  const org = conns.find((c) => c.tenantType === 'ORGANISATION') ?? conns[0]
  if (!org) throw new Error('No Xero organisation was chosen.')

  const { error } = await createAdminClient()
    .from('xero_connection')
    .upsert({
      id: 1,
      tenant_id: org.tenantId,
      tenant_name: org.tenantName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      connected_by: userId,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  if (error) throw new Error(error.message)
  return org.tenantName
}

export async function getXeroConnection(): Promise<XeroConnection | null> {
  const { data } = await createAdminClient().from('xero_connection').select('*').eq('id', 1).maybeSingle<XeroConnection>()
  return data ?? null
}

export async function disconnectXero() {
  await createAdminClient().from('xero_connection').delete().eq('id', 1)
}

// A current access token, refreshing it (and saving the new refresh token -
// Xero gives a new one each time) when it's about to expire.
async function accessToken(): Promise<{ token: string; tenantId: string }> {
  const conn = await getXeroConnection()
  if (!conn) throw new Error('Xero is not connected.')
  if (Date.parse(conn.expires_at) - Date.now() > 60_000) return { token: conn.access_token, tenantId: conn.tenant_id }

  const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: conn.refresh_token })
  await createAdminClient()
    .from('xero_connection')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
  return { token: tokens.access_token, tenantId: conn.tenant_id }
}

// Xero's error message from a failed request, in plain words where possible.
function problemText(json: unknown, status: number): string {
  const j = json as { title?: string; detail?: string; invalidFields?: { name?: string; reason?: string }[] } | null
  const fields = j?.invalidFields?.map((f) => f.reason).filter(Boolean).join('; ')
  return fields || j?.detail || j?.title || `Xero error ${status}`
}

export async function payrollNz<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { token, tenantId } = await accessToken()
  const res = await fetch(`${PAYROLL_NZ}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Xero-Tenant-Id': tenantId,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(problemText(json, res.status))
  return json as T
}

export type XeroEmployee = { employeeID: string; firstName: string; lastName: string; payrollCalendarID: string | null; endDate: string | null }
export type XeroCalendar = { payrollCalendarID: string; name: string; calendarType: string; periodStartDate: string; periodEndDate: string; paymentDate: string }
export type XeroEarningsRate = { earningsRateID: string; name: string; earningsType: string; currentRecord?: boolean }

export async function xeroEmployees(): Promise<XeroEmployee[]> {
  const all: XeroEmployee[] = []
  for (let page = 1; page < 20; page++) {
    const r = await payrollNz<{ employees: XeroEmployee[] }>(`/Employees?page=${page}`)
    all.push(...(r.employees ?? []))
    if ((r.employees ?? []).length < 100) break
  }
  return all.filter((e) => !e.endDate || e.endDate.slice(0, 10) >= new Date().toISOString().slice(0, 10))
}

export async function xeroCalendars(): Promise<XeroCalendar[]> {
  const r = await payrollNz<{ payRunCalendars: XeroCalendar[] }>('/PayRunCalendars')
  return (r.payRunCalendars ?? []).map((c) => ({
    ...c,
    periodStartDate: c.periodStartDate.slice(0, 10),
    periodEndDate: c.periodEndDate.slice(0, 10),
    paymentDate: c.paymentDate?.slice(0, 10),
  }))
}

// Supervisors and sales staff are paid salary: their hours go on Xero's
// "Salary" pay item unless they've been given their own.
export const SALARY_ROLES = ['supervisor', 'sales']
export const salaryRateId = (rates: XeroEarningsRate[]) => rates.find((r) => r.name.trim().toLowerCase() === 'salary')?.earningsRateID ?? null

export async function xeroEarningsRates(): Promise<XeroEarningsRate[]> {
  const r = await payrollNz<{ earningsRates: XeroEarningsRate[] }>('/EarningsRates')
  return (r.earningsRates ?? []).filter((e) => e.currentRecord !== false)
}
