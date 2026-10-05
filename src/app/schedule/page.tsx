// Schedule — which crew is on which job, week by week (like Tradify's
// Scheduler). Anyone with Schedule ticked on the Users page. Booking a job moves it to Scheduled
// on the Production board.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canOpenPage } from "@/lib/auth/pageAccess";
import { navForViewer } from "@/lib/nav";
import { loadSchedule } from "@/lib/schedule/data";
import { DashboardShell } from "@/components/dashboard/parts";
import { TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { mondayOf, nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { ScheduleBoard } from "@/components/schedule/ScheduleBoard";

export const metadata: Metadata = { title: "Schedule · Platinum Hub" };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string; book?: string }> }) {
  if (!(await canOpenPage("schedule"))) redirect("/");
  const { week, book } = await searchParams;
  const today = nzTodayDateString();
  const weekStart = mondayOf(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);

  const supabase = await createClient();
  const [data, nav] = await Promise.all([loadSchedule(supabase, weekStart), navForViewer()]);

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={nav} activeHref="/schedule" />}
      todayKey={today}
      title="Schedule"
    >
      {data.notReady ? (
        <p className="rounded-lg border border-[#E3E1DA] bg-white p-4 text-sm">
          The Schedule needs its database script (schedule_and_proposal_decline.sql) run first.
        </p>
      ) : (
        <ScheduleBoard data={data} today={today} bookJobId={book ?? null} />
      )}
    </DashboardShell>
  );
}
