// One Health & safety report, to read or print (Download PDF).
import Link from "next/link";
import { notFound } from "next/navigation";
import { reportForm, type ReportData } from "@/lib/safety/forms";
import { fmtDay, safetyContext } from "@/lib/safety/data";
import { ReportView } from "@/components/safety/ReportView";
import { PrintButton } from "@/components/quotes/PrintButton";
import { card, secondaryBtn } from "@/components/safety/styles";
import { DeleteReportButton } from "@/components/safety/DeleteReportButton";

type Row = {
  id: string;
  report_type: string;
  status: string;
  location: string | null;
  report_date: string;
  created_at: string;
  created_by: string | null;
  data: ReportData;
  site: { name: string } | null;
  author: { full_name: string } | null;
};

export default async function SafetyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, isAdmin, isManager, userId } = await safetyContext();
  const { data: r } = await supabase
    .from("safety_reports")
    .select("id, report_type, status, location, report_date, created_at, created_by, data, site:sites(name), author:profiles!safety_reports_created_by_fkey(full_name)")
    .eq("id", id)
    .maybeSingle<Row>();
  const form = r ? reportForm(r.report_type) : null;
  if (!r || !form) notFound();
  const canEdit = isManager || r.created_by === userId;

  return (
    <div className="flex flex-col gap-4">
      <div className={`${card} flex flex-wrap items-start justify-between gap-3 p-4 print:border-0 print:shadow-none`}>
        <div>
          <h2 className="text-xl font-bold">{form.title}</h2>
          <p className="mt-1 text-sm text-[#5B6472]">
            {fmtDay(r.report_date)}
            {r.site?.name ? ` · ${r.site.name}` : ""}
            {r.location ? ` · ${r.location}` : ""}
          </p>
          <p className="text-sm text-[#5B6472]">
            By {r.author?.full_name ?? "—"}
            {r.status === "draft" && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">Draft</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Link href="/safety/reports" className={secondaryBtn}>
            All reports
          </Link>
          {canEdit && (
            <Link href={`/safety/reports/new?id=${r.id}`} className={secondaryBtn}>
              Edit
            </Link>
          )}
          <PrintButton label="Download PDF" />
          {isAdmin && <DeleteReportButton id={r.id} />}
        </div>
      </div>
      <ReportView form={form} data={r.data ?? {}} />
    </div>
  );
}
