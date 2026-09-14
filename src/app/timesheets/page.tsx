import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/profile'

export default async function TimesheetsIndexPage() {
  const profile = await getCurrentProfile()
  redirect(profile.role === 'admin' || profile.role === 'supervisor' ? '/timesheets/admin' : '/timesheets/clock')
}
