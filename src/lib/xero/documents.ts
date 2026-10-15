// Suppliers' emailed bills (Resene especially) bring their email logos with
// them: Xero makes the bill from the PDF, but drops every picture in the
// email into the Documents inbox. Each morning (and on "Check Xero now")
// those are moved out of the inbox into a "Email logos" folder - moved, not
// deleted, so anything caught by mistake is still there.
//
// Only pictures, never PDFs, and only: Resene's known logo files, or any
// picture under 10 KB (signature icons). Files attached to a bill or
// anything else in Xero are left alone.
import { filesApi } from './client'

type XeroFile = { Id: string; Name: string; MimeType: string; Size: number; FolderId: string }
type XeroFolder = { Id: string; Name: string; IsInbox?: boolean }

const FOLDER_NAME = 'Email logos'
const KNOWN_LOGOS = [
  /^RD_(QSA_)?\d{4}\.(png|jpe?g)$/i, // Resene's footer logos, by year
  /^spacer\.gif$/i,
  /^logo\.jpe?g$/i,
  /symbolOT\.(gif|png)$/i, // Resene's cash / save / question icons
]
const SMALL = 10 * 1024

export const isEmailLogo = (f: Pick<XeroFile, 'Name' | 'MimeType' | 'Size'>) =>
  /^image\//i.test(f.MimeType) && (KNOWN_LOGOS.some((r) => r.test(f.Name)) || f.Size < SMALL)

export type TidyResult = { moved: number; left?: number; error?: string; needsReconnect?: boolean }

export async function tidyXeroDocuments(): Promise<TidyResult> {
  try {
    const inbox = await filesApi<XeroFolder>('/Inbox')
    const folders = await filesApi<XeroFolder[]>('/Folders')
    let target = folders.find((f) => f.Name.trim().toLowerCase() === FOLDER_NAME.toLowerCase())
    if (!target) target = await filesApi<XeroFolder>('/Folders', { method: 'POST', body: { Name: FOLDER_NAME } })

    // Every file in the inbox (100 a page).
    const files: XeroFile[] = []
    for (let page = 1; page <= 20; page++) {
      const r = await filesApi<{ Items: XeroFile[]; TotalCount: number }>(`/Files?pagesize=100&page=${page}&sort=CreatedDateUTC&direction=DESC`)
      files.push(...(r.Items ?? []))
      if ((r.Items ?? []).length < 100) break
    }
    const candidates = files.filter((f) => f.FolderId === inbox.Id && isEmailLogo(f))

    // Xero allows about 60 requests a minute, and each file is two (check,
    // move): pace them, and stop after ~25s - the rest go on the next run.
    const started = Date.now()
    let moved = 0
    let left = 0
    for (const f of candidates) {
      if (Date.now() - started > 25_000) {
        left++
        continue
      }
      // Attached to a bill (or anything else)? Leave it.
      const links = await filesApi<unknown[]>(`/Files/${f.Id}/Associations`).catch(() => [{}])
      if (Array.isArray(links) && links.length) continue
      await filesApi(`/Files/${f.Id}`, { method: 'PUT', body: { Name: f.Name, FolderId: target.Id } })
      moved++
      await new Promise((r) => setTimeout(r, 1200))
    }
    return { moved, left }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed'
    if (msg === 'MISSING_FILES_PERMISSION') return { moved: 0, needsReconnect: true, error: 'Reconnect Xero to tidy the Documents inbox.' }
    return { moved: 0, error: msg }
  }
}
