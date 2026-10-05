// A finished Health & safety report, laid out to read or print.
import { RISK_LEVELS, type ReportData, type ReportForm, type RiskRow } from "@/lib/safety/forms";
import { card } from "./styles";

const RISK_CLASS: Record<string, string> = {
  low: "bg-green-50 text-green-800",
  medium: "bg-amber-50 text-amber-900",
  high: "bg-[#FDECEC] text-[#B91C1C]",
  extreme: "bg-[#B91C1C] text-white",
};

export function RiskPill({ risk }: { risk: string | null | undefined }) {
  if (!risk) return <span className="text-[#8A919C]">—</span>;
  const label = RISK_LEVELS.find((l) => l.value === risk)?.label ?? risk;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${RISK_CLASS[risk] ?? ""}`}>{label}</span>;
}

export function ReportView({ form, data }: { form: ReportForm; data: ReportData }) {
  return (
    <>
      {form.sections.map((section) => (
        <section key={section.title} className={`${card} p-4 print:border-0 print:shadow-none`}>
          <h3 className="mb-3 font-semibold">{section.title}</h3>
          <dl className="flex flex-col gap-3 text-sm">
            {section.fields.map((f) => {
              const v = data[f.key];
              let shown: React.ReactNode = <span className="text-[#8A919C]">—</span>;
              if (f.kind === "checklist" && v && typeof v === "object") {
                const answers = v as Record<string, string>;
                shown = (
                  <ul className="divide-y divide-[#EFEDE7]">
                    {f.items.map((item) => (
                      <li key={item} className="flex justify-between gap-3 py-1.5">
                        <span>{item}</span>
                        <span
                          className={`font-semibold ${answers[item] === "no" ? "text-[#B91C1C]" : answers[item] ? "text-[#16202E]" : "text-[#8A919C]"}`}
                        >
                          {answers[item] === "yes" ? "Yes" : answers[item] === "no" ? "No" : answers[item] === "na" ? "N/A" : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                );
              } else if ((f.kind === "ticks" || f.kind === "people") && Array.isArray(v) && v.length) {
                shown = (v as string[]).join(", ");
              } else if (f.kind === "risks" && Array.isArray(v) && v.length) {
                shown = (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[32rem] text-left text-sm">
                      <thead className="text-xs uppercase tracking-wide text-[#5B6472]">
                        <tr>
                          <th className="py-1 pr-2">{f.stepLabel}</th>
                          <th className="py-1 pr-2">Hazard</th>
                          <th className="py-1 pr-2">Controls</th>
                          <th className="py-1">Risk</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EFEDE7]">
                        {(v as RiskRow[]).map((r, i) => (
                          <tr key={i}>
                            <td className="py-1.5 pr-2 align-top">{r.step}</td>
                            <td className="py-1.5 pr-2 align-top">{r.hazard}</td>
                            <td className="py-1.5 pr-2 align-top">{r.controls}</td>
                            <td className="py-1.5 align-top">
                              <RiskPill risk={r.risk} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              } else if (typeof v === "string" && v.trim()) {
                shown = <span className="whitespace-pre-wrap">{v}</span>;
              }
              return (
                <div key={f.key}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[#5B6472]">{f.label}</dt>
                  <dd className="mt-0.5">{shown}</dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </>
  );
}
