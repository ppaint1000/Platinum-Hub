export const SITE_DOCUMENT_KINDS = ['extent-of-work', 'safety-plan'] as const
export type SiteDocumentKind = (typeof SITE_DOCUMENT_KINDS)[number]

export const SITE_DOCUMENT_LABELS: Record<SiteDocumentKind, string> = {
  'extent-of-work': 'Extent of Work',
  'safety-plan': 'Site Safety Plan',
}

export const SITE_DOCUMENT_COLUMN: Record<SiteDocumentKind, 'extent_of_work_filename' | 'safety_plan_filename'> = {
  'extent-of-work': 'extent_of_work_filename',
  'safety-plan': 'safety_plan_filename',
}

export function siteDocumentPath(siteId: string, kind: SiteDocumentKind): string {
  return `${siteId}/${kind}.pdf`
}

export function isSiteDocumentKind(value: string): value is SiteDocumentKind {
  return (SITE_DOCUMENT_KINDS as readonly string[]).includes(value)
}
