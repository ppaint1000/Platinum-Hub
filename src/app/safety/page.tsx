// Health & safety overview (like HazardCo's dashboard): this month's
// reports, incidents and tasks, quick buttons to start a report, and
// what's recent.
import Link from "next/link";
import { REPORT_FORMS, reportForm, summaryOf, type ReportData } from "@/lib/safety/forms";
import { fmtDay, safetyContext } from "@/lib/safety/data";
import { card } from "@/components/safety/styles";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

type Row = { id: string; report_type: string; report_date: string; data: ReportData; author: { full_name: string } | null };

export default async function SafetyOverviewPage() {
  const { supabase, isManager } = await safetyContext();
  const today = nzTodayDateString();
  const monthStart = today.slice(0, 8) + "01";
  const [{ data: month }, { data: recent }, { data: tasks }, { count: hazards }] = await Promise.all([
    supabase.from("safety_reports").select("report_type").eq("status", "completed").gte("report_date", monthStart).returns<{ report_type: string }[]>(),
    supabase
      .from("safety_reports")
      .select("id, report_type, report_date, data, author:profiles!safety_reports_created_by_fkey(full_name)")
      .eq("status", "completed")
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<Row[]>(),
    supabase.from("safety_tasks").select("id, due_on").eq("status", "open").returns<{ id: string; due_on: string | null }[]>(),
    supabase.from("safety_hazards").select("id", { count: "exact", head: true }).eq("active", true),
  ]);
  const reportsThisMonth = (month ?? []).length;
  const incidentsThisMonth = (month ?? []).filter((r) => r.report_type === "incident").length;
  const openTasks = (tasks ?? []).length;
  const overdue = (tasks ?? []).filter((t) => t.due_on && t.due_on < today).length;

  const tiles = [
    { label: "Reports this month", value: reportsThisMonth, href: "/safety/reports" },
    { label: "Incidents this month", value: incidentsThisMonth, href: "/safety/incidents", alert: incidentsThisMonth > 0 },
    { label: isManager ? "Open tasks" : "Your open tasks", value: openTasks, href: "/safety/tasks", note: overdue ? `${overdue} overdue` : undefined, alert: overdue > 0 },
    { label: "Hazards on the register", value: hazards ?? 0, href: "/safety/hazards" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className={`${card} block p-4 hover:border-[#9DB6D9]`}>
            <p className="text-sm font-semibold text-[#5B6472]">{t.label}</p>
            <p className={`mt-1 text-3xl font-bold ${t.alert ? "text-[#B91C1C]" : ""}`}>{t.value}</p>
            {t.note && <p className="text-xs font-semibold text-[#B91C1C]">{t.note}</p>}
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Start a report</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {REPORT_FORMS.map((f) => (
            <Link
              key={f.type}
              href={`/safety/reports/new?type=${f.type}`}
              className={`flex min-h-14 items-center rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm ${
                f.type === "incident" ? "border-[#B91C1C] bg-[#B91C1C] text-white hover:bg-[#991B1B]" : "border-[#E3E1DA] bg-white text-[#1F4E8C] hover:border-[#9DB6D9]"
              }`}
            >
              {f.title}
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent reports</h2>
          <Link href="/safety/reports" className="text-sm font-semibold text-[#1F4E8C] hover:underline">
            All reports
          </Link>
        </div>
        <div className={card}>
          {!recent?.length ? (
            <p className="p-6 text-sm text-[#5B6472]">No reports yet - start one above.</p>
          ) : (
            <ul className="divide-y divide-[#EFEDE7]">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/safety/reports/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-[#F8FAFD]">
                    <span className="w-28 shrink-0 font-semibold">{fmtDay(r.report_date)}</span>
                    <span className={`w-48 shrink-0 font-semibold ${r.report_type === "incident" ? "text-[#B91C1C]" : "text-[#1F4E8C]"}`}>
                      {reportForm(r.report_type)?.title ?? r.report_type}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[#5B6472]">{summaryOf(r.report_type, r.data)}</span>
                    <span className="text-[#5B6472]">{r.author?.full_name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
