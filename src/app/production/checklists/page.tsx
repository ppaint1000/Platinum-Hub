// Edit the Pre-job and Post-job checklist items (admins). Supervisors and
// admins tick them on each job from the Production board.
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { loadChecklists } from "@/lib/jobs/checklists";
import { ChecklistEditor } from "@/components/production/ChecklistEditor";
import { DashboardShell } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export const metadata: Metadata = { title: "Checklists · Production · Platinum Hub" };

export default async function ChecklistsPage() {
  const supabase = await requireAdmin();
  const { items } = await loadChecklists(supabase, []);
  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={ADMIN_NAV} activeHref="/production" />}
      todayKey={nzTodayDateString()}
      title="Job checklists"
    >
      <Link href="/production" className="flex w-fit items-center gap-1 text-sm font-medium text-[#5B6472] hover:text-[#16202E]">
        <ChevronLeft className="h-4 w-4" />
        Back to Production
      </Link>
      <ChecklistEditor items={items} />
    </DashboardShell>
  );
}
