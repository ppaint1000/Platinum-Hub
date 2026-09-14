import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/profile'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await getCurrentProfile()
  const { id } = await params

  const supabase = await createClient()
  const { data: doc } = await supabase
    .from('site_documents')
    .select('name, storage_path, sites(is_active)')
    .eq('id', id)
    .single<{
      name: string
      storage_path: string
      sites: { is_active: boolean } | { is_active: boolean }[] | null
    }>()

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const site = Array.isArray(doc.sites) ? doc.sites[0] : doc.sites
  if (profile.role === 'painter' && site && !site.is_active) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: file, error } = await supabase.storage.from('site-documents').download(doc.storage_path)

  if (error || !file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return new NextResponse(file, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${doc.name}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
