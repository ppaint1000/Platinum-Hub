// Every Health & safety report (managers) or your own (everyone else),
// completed or draft, filtered by type.
import Link from "next/link";
import { Plus } from "lucide-react";
import { REPORT_FORMS, reportForm, summaryOf, type ReportData } from "@/lib/safety/forms";
import { fmtDay, safetyContext } from "@/lib/safety/data";
import { card, primaryBtn } from "@/components/safety/styles";

type Row = {
  id: string;
  report_type: string;
  status: string;
  location: string | null;
  report_date: string;
  data: ReportData;
  site: { name: string } | null;
  author: { full_name: string } | null;
};

export default async function SafetyReportsPage({ searchParams }: { searchParams: Promise<{ type?: string; status?: string }> }) {
  const { type, status } = await searchParams;
  const showDrafts = status === "draft";
  const { supabase, isManager } = await safetyContext();
  let q = supabase
    .from("safety_reports")
    .select("id, report_type, status, location, report_date, data, site:sites(name), author:profiles!safety_reports_created_by_fkey(full_name)")
    .eq("status", showDrafts ? "draft" : "completed")
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (type && reportForm(type)) q = q.eq("report_type", type);
  const { data: rows } = await q.returns<Row[]>();
  const href = (t?: string, s?: string) => {
    const p = new URLSearchParams();
    if (t) p.set("type", t);
    if (s) p.set("status", s);
    const qs = p.toString();
    return `/safety/reports${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={href(type)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${!showDrafts ? "bg-[#16202E] text-white" : "text-[#3F4753] hover:bg-[#ECEAE3]"}`}>
          Completed
        </Link>
        <Link href={href(type, "draft")} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${showDrafts ? "bg-[#16202E] text-white" : "text-[#3F4753] hover:bg-[#ECEAE3]"}`}>
          Drafts
        </Link>
        <form className="ml-auto flex items-center gap-2" action="/safety/reports">
          {showDrafts && <input type="hidden" name="status" value="draft" />}
          <select name="type" defaultValue={type ?? ""} className="rounded-lg border border-[#D9D6CC] bg-white px-3 py-2 text-sm">
            <option value="">All report types</option>
            {REPORT_FORMS.map((f) => (
              <option key={f.type} value={f.type}>
                {f.title}
              </option>
            ))}
          </select>
          <button className="rounded-lg border border-[#D9D6CC] bg-white px-3 py-2 text-sm font-semibold">Show</button>
        </form>
        <Link href="/safety/reports/new" className={primaryBtn}>
          <Plus className="h-4 w-4" /> New report
        </Link>
      </div>
      {!isManager && <p className="text-sm text-[#5B6472]">These are the reports you&apos;ve filled in.</p>}

      <div className={card}>
        {!rows?.length ? (
          <p className="p-6 text-sm text-[#5B6472]">No {showDrafts ? "drafts" : "reports"} yet.</p>
        ) : (
          <ul className="divide-y divide-[#EFEDE7]">
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={showDrafts ? `/safety/reports/new?id=${r.id}` : `/safety/reports/${r.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-[#F8FAFD]"
                >
                  <span className="w-28 shrink-0 font-semibold">{fmtDay(r.report_date)}</span>
                  <span className="w-48 shrink-0 font-semibold text-[#1F4E8C]">{reportForm(r.report_type)?.title ?? r.report_type}</span>
                  <span className="min-w-0 flex-1 truncate text-[#3F4753]">
                    {[r.site?.name, r.location].filter(Boolean).join(" · ")}
                    {summaryOf(r.report_type, r.data) && <span className="block truncate text-[#5B6472]">{summaryOf(r.report_type, r.data)}</span>}
                  </span>
                  <span className="text-[#5B6472]">{r.author?.full_name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
