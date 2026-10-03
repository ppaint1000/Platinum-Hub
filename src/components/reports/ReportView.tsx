"use client";

// One report: date range, charts, then the summary with Export and the
// table (sortable, 50 rows a page) - the same order as PaintScout's.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronDown, ChevronUp, Download } from "lucide-react";
import type { Cell, CellFormat, Report } from "@/lib/reports/build";
import { RANGES, type DateRange } from "@/lib/reports/range";
import { ColumnChart, DonutChart, HBarChart, LineChart } from "./charts";

const PAGE = 50;

function fmtCell(v: Cell, format: CellFormat): string {
  if (v === null || v === undefined || v === "") return "";
  switch (format) {
    case "money":
      return "$" + Number(v).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "pct":
      return `${(Number(v) * 100).toFixed(1)}%`;
    case "hours":
      return (Math.round(Number(v) * 10) / 10).toLocaleString("en-NZ");
    case "number":
      return Number(v).toLocaleString("en-NZ");
    case "date": {
      const s = String(v);
      const d = s.length === 10 ? new Date(`${s}T12:00:00+12:00`) : new Date(s);
      return d.toLocaleDateString("en-NZ", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Pacific/Auckland" });
    }
    default:
      return String(v);
  }
}

// For the CSV: plain numbers, dates as YYYY-MM-DD.
function csvCell(v: Cell, format: CellFormat): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (format === "date") s = String(v).slice(0, 10);
  else if (format === "money" || format === "hours") s = String(Math.round(Number(v) * 100) / 100);
  else if (format === "pct") s = String(Math.round(Number(v) * 1000) / 10);
  else s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ReportView({ report, range }: { report: Report; range: DateRange }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    if (!sort) return report.rows;
    const fmt = report.columns.find((c) => c.key === sort.key)?.format;
    return [...report.rows].sort((a, b) => {
      const va = a.cells[sort.key];
      const vb = b.cells[sort.key];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      const cmp = fmt === "text" || fmt === "date" ? String(va).localeCompare(String(vb)) : Number(va) - Number(vb);
      return sort.desc ? -cmp : cmp;
    });
  }, [report, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);

  function exportCsv() {
    const header = report.columns.map((c) => csvCell(c.label, "text")).join(",");
    const lines = rows.map((r) => report.columns.map((c) => csvCell(r.cells[c.key], c.format)).join(","));
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.slug}-${range.key}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const rightAligned = (f: CellFormat) => f === "money" || f === "pct" || f === "number" || f === "hours";

  return (
    <div className="flex flex-col gap-5">
      <Link href="/reports" className="flex w-fit items-center gap-1 text-sm font-medium text-[#5B6472] hover:text-[#16202E]">
        <ChevronLeft className="h-4 w-4" />
        Back to Reports
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[#5B6472]">{report.description}</p>
          <p className="mt-0.5 text-xs text-[#8A919C]">
            {range.label}
            {report.dateBasis ? ` · by ${report.dateBasis.toLowerCase()}` : ""}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[#5B6472]">Date range</span>
          <select
            value={range.key}
            onChange={(e) => {
              setPage(0);
              router.push(`/reports/${report.slug}?range=${e.target.value}`);
            }}
            className="rounded-lg border border-[#E3E1DA] bg-white px-3 py-2 text-sm text-[#16202E]"
          >
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {report.charts.length > 0 && (
        <div className={`grid gap-4 ${report.charts.length > 1 ? "lg:grid-cols-2" : ""}`}>
          {report.charts.map((c) => {
            switch (c.kind) {
              case "hbar":
                return <HBarChart key={c.title} {...c} />;
              case "columns":
                return <ColumnChart key={c.title} {...c} />;
              case "line":
                return <LineChart key={c.title} {...c} />;
              case "donut":
                return <DonutChart key={c.title} {...c} />;
            }
          })}
        </div>
      )}

      <section className="rounded-xl border border-[#E3E1DA] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
          <h2 className="text-base font-semibold text-[#16202E]">Summary</h2>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-[#E3E1DA] px-3 py-1.5 text-sm font-medium text-[#1F4E8C] hover:bg-[#E3ECF8] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 px-4 py-3">
          {report.summary.map((s) => (
            <div key={s.label}>
              <dt className="text-xs text-[#5B6472]">{s.label}</dt>
              <dd className="text-lg font-bold text-[#16202E]">{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-[#16202E] text-white">
              <tr>
                {report.columns.map((c) => {
                  const active = sort?.key === c.key;
                  return (
                    <th
                      key={c.key}
                      className={`whitespace-nowrap px-3 py-3 font-semibold ${rightAligned(c.format) ? "text-right" : "text-left"}`}
                      aria-sort={active ? (sort!.desc ? "descending" : "ascending") : "none"}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setPage(0);
                          setSort((s) => (s?.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: c.format !== "text" }));
                        }}
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        {c.label}
                        {active && (sort!.desc ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-[#EFEDE7] hover:bg-[#F5F4F0]">
                  {report.columns.map((c, i) => {
                    const text = fmtCell(r.cells[c.key], c.format);
                    return (
                      <td
                        key={c.key}
                        className={`px-3 py-2.5 ${rightAligned(c.format) ? "whitespace-nowrap text-right" : ""} ${c.format === "date" ? "whitespace-nowrap" : ""}`}
                      >
                        {i === report.columns.findIndex((col) => col.key === "job") && r.href ? (
                          <Link href={r.href} className="font-medium text-[#1F4E8C] hover:underline">
                            {text}
                          </Link>
                        ) : (
                          text
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[#5B6472]">No results</p>
        ) : (
          <div className="flex items-center justify-center gap-3 border-t border-[#EFEDE7] px-4 py-3 text-sm text-[#5B6472]">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              className="rounded px-2 py-1 hover:bg-[#F5F4F0] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            Page {page + 1} of {pages} · {rows.length} row{rows.length === 1 ? "" : "s"}
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              disabled={page >= pages - 1}
              aria-label="Next page"
              className="rotate-180 rounded px-2 py-1 hover:bg-[#F5F4F0] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
