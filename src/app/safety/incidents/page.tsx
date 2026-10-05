// Incidents - every Incident Report, laid out like HazardCo's register:
// date, site, people, type, treatment.
import Link from "next/link";
import { Plus } from "lucide-react";
import type { ReportData } from "@/lib/safety/forms";
import { fmtDay, safetyContext } from "@/lib/safety/data";
import { card, primaryBtn } from "@/components/safety/styles";

type Row = {
  id: string;
  report_date: string;
  location: string | null;
  data: ReportData;
  site: { name: string } | null;
  author: { full_name: string } | null;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

export default async function SafetyIncidentsPage() {
  const { supabase } = await safetyContext();
  const { data: rows } = await supabase
    .from("safety_reports")
    .select("id, report_date, location, data, site:sites(name), author:profiles!safety_reports_created_by_fkey(full_name)")
    .eq("report_type", "incident")
    .eq("status", "completed")
    .order("report_date", { ascending: false })
    .returns<Row[]>();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[#5B6472]">Injuries, near misses, damage and illness. The office is emailed when one is reported.</p>
        <Link href="/safety/reports/new?type=incident" className={primaryBtn}>
          <Plus className="h-4 w-4" /> Report an incident
        </Link>
      </div>
      <div className={`${card} overflow-x-auto`}>
        {!rows?.length ? (
          <p className="p-6 text-sm text-[#5B6472]">No incidents reported.</p>
        ) : (
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-[#E3E1DA] bg-[#F8F7F3] text-xs uppercase tracking-wide text-[#5B6472]">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Site</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">People involved</th>
                <th className="px-4 py-2">Treatment</th>
                <th className="px-4 py-2">WorkSafe</th>
                <th className="px-4 py-2">Logged by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEDE7]">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-[#F8FAFD]">
                  <td className="px-4 py-2.5 font-semibold">
                    <Link href={`/safety/reports/${r.id}`} className="text-[#1F4E8C] hover:underline">
                      {fmtDay(r.report_date)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{[r.site?.name, r.location].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="px-4 py-2.5">{str(r.data.incident_type) || "—"}</td>
                  <td className="px-4 py-2.5">{Array.isArray(r.data.people_involved) ? (r.data.people_involved as string[]).join(", ") : "—"}</td>
                  <td className="px-4 py-2.5">{str(r.data.treatment) || "—"}</td>
                  <td className={`px-4 py-2.5 ${str(r.data.notifiable).startsWith("Yes - not") ? "font-semibold text-[#B91C1C]" : ""}`}>
                    {str(r.data.notifiable) || "—"}
                  </td>
                  <td className="px-4 py-2.5">{r.author?.full_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
