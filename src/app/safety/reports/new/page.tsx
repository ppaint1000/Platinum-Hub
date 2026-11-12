// A new Health & safety report (?type=), or carrying on with a draft (?id=).
import Link from "next/link";
import { notFound } from "next/navigation";
import { REPORT_FORMS, reportForm, type ReportData } from "@/lib/safety/forms";
import { safetyContext, safetySites } from "@/lib/safety/data";
import { ReportFormClient } from "@/components/safety/ReportFormClient";
import { card } from "@/components/safety/styles";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export default async function NewSafetyReportPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string }> }) {
  const { type, id } = await searchParams;
  const { supabase } = await safetyContext();

  if (id) {
    const { data: r } = await supabase
      .from("safety_reports")
      .select("id, report_type, site_id, location, report_date, data")
      .eq("id", id)
      .maybeSingle<{ id: string; report_type: string; site_id: string | null; location: string | null; report_date: string; data: ReportData }>();
    const form = r ? reportForm(r.report_type) : null;
    if (!r || !form) notFound();
    return (
      <ReportFormClient
        form={form}
        sites={await safetySites()}
        initial={{ id: r.id, siteId: r.site_id ?? "", location: r.location ?? "", reportDate: r.report_date, data: r.data ?? {} }}
      />
    );
  }

  const form = type ? reportForm(type) : null;
  if (!form) {
    // Pick which report.
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {REPORT_FORMS.map((f) => (
          <Link key={f.type} href={`/safety/reports/new?type=${f.type}`} className={`${card} block p-4 hover:border-[#9DB6D9]`}>
            <p className="font-semibold text-[#1F4E8C]">{f.title}</p>
            <p className="mt-1 text-sm text-[#5B6472]">{f.description}</p>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <ReportFormClient
      form={form}
      sites={await safetySites()}
      initial={{ siteId: "", location: "", reportDate: nzTodayDateString(), data: {} }}
    />
  );
}
