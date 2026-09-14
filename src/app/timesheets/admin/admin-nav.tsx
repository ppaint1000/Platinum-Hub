'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Role } from '@/lib/supabase/profile'

const links = [
  { href: '/timesheets/admin', label: 'Dashboard' },
  { href: '/timesheets/clock', label: 'Clock In/Out' },
  { href: '/timesheets/timesheet', label: 'Timesheet' },
  { href: '/timesheets/admin/activity', label: 'Activity' },
  { href: '/timesheets/admin/reports', label: 'Reports', adminOnly: true },
  { href: '/timesheets/admin/reports/by-job', label: 'Hours by Job', adminOnly: true },
  { href: '/timesheets/admin/customers', label: 'Customers' },
  { href: '/timesheets/admin/sites', label: 'Sites' },
  { href: '/timesheets/admin/staff', label: 'Staff' },
  { href: '/timesheets/admin/staff-types', label: 'Manage Staff Types', adminOnly: true },
  { href: '/hub', label: 'Hub' },
]

export function AdminNav({ role }: { role: Role }) {
  const pathname = usePathname()
  const visibleLinks = links.filter((link) => !link.adminOnly || role === 'admin')

  return (
    <nav className="flex flex-col gap-2 p-3">
      {visibleLinks.map((link) => {
        const active =
          link.href === '/timesheets/admin'
            ? pathname === '/timesheets/admin'
            : pathname === link.href || pathname.startsWith(`${link.href}/`)

        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              active ? 'bg-red-600 text-white' : 'bg-gray-300 text-gray-800 hover:bg-gray-400'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
