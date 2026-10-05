"use client";

// Filling in a Health & safety report on a phone or PC: the date, site and
// each question of the chosen form. Save as draft to finish later, or
// Submit when it's done (required questions must be answered).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { RISK_LEVELS, type Field, type ReportData, type ReportForm, type RiskRow } from "@/lib/safety/forms";
import { saveReportAction } from "@/app/safety/actions";
import { card, input, primaryBtn, secondaryBtn } from "./styles";

const ANSWERS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "na", label: "N/A" },
];

export function ReportFormClient({
  form,
  sites,
  initial,
}: {
  form: ReportForm;
  sites: { id: string; name: string }[];
  initial: { id?: string; siteId: string; location: string; reportDate: string; data: ReportData };
}) {
  const router = useRouter();
  const [siteId, setSiteId] = useState(initial.siteId);
  const [location, setLocation] = useState(initial.location);
  const [reportDate, setReportDate] = useState(initial.reportDate);
  const [data, setData] = useState<ReportData>(initial.data);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (key: string, value: unknown) => setData((d) => ({ ...d, [key]: value }));

  function save(status: "draft" | "completed") {
    setError(null);
    start(async () => {
      const r = await saveReportAction({ id: initial.id, type: form.type, status, siteId, location, reportDate, data });
      if (r.error) return setError(r.error);
      router.push(status === "draft" ? "/safety/reports?status=draft" : `/safety/reports/${r.id}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`${card} p-4`}>
        <h2 className="text-lg font-semibold">{form.title}</h2>
        <p className="mt-1 text-sm text-[#5B6472]">{form.description}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Date</span>
            <input type="date" className={input} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Site</span>
            <select className={input} value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">Not a site / other</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Location / address</span>
            <input className={input} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Level 2 stairwell" />
          </label>
        </div>
      </div>

      {form.sections.map((section) => (
        <section key={section.title} className={`${card} flex flex-col gap-4 p-4`}>
          <h3 className="font-semibold">{section.title}</h3>
          {section.fields.map((f) => (
            <FieldInput key={f.key} field={f} value={data[f.key]} onChange={(v) => set(f.key, v)} />
          ))}
        </section>
      ))}

      {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-[#E3E1DA] bg-[#F5F4F0]/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-xl md:border">
        <button type="button" onClick={() => save("draft")} disabled={pending} className={secondaryBtn}>
          Save as draft
        </button>
        <button type="button" onClick={() => save("completed")} disabled={pending} className={primaryBtn}>
          {pending ? "Saving…" : "Submit report"}
        </button>
      </div>
    </div>
  );
}

function Label({ field }: { field: Field }) {
  return (
    <span className="font-semibold">
      {field.label}
      {"required" in field && field.required && <span className="text-[#B91C1C]"> *</span>}
      {"hint" in field && field.hint && <span className="block text-xs font-normal text-[#5B6472]">{field.hint}</span>}
    </span>
  );
}

function FieldInput({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: unknown) => void }) {
  const text = typeof value === "string" ? value : "";
  switch (field.kind) {
    case "text":
    case "time":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <Label field={field} />
          <input type={field.kind === "time" ? "time" : "text"} className={input} value={text} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
    case "textarea":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <Label field={field} />
          <textarea className={input} rows={3} value={text} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
    case "select":
      return (
        <label className="flex flex-col gap-1 text-sm">
          <Label field={field} />
          <select className={input} value={text} onChange={(e) => onChange(e.target.value)}>
            <option value="">Choose…</option>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      );
    case "checklist": {
      const answers = (value && typeof value === "object" ? value : {}) as Record<string, string>;
      return (
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1">
            <Label field={field} />
          </legend>
          {field.items.map((item) => (
            <div key={item} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEDE7] py-2 last:border-b-0">
              <span>{item}</span>
              <span className="flex gap-1">
                {ANSWERS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => onChange({ ...answers, [item]: answers[item] === a.value ? "" : a.value })}
                    aria-pressed={answers[item] === a.value}
                    className={`min-h-9 min-w-12 rounded-lg border px-2.5 text-sm font-semibold ${
                      answers[item] === a.value
                        ? a.value === "no"
                          ? "border-[#B91C1C] bg-[#B91C1C] text-white"
                          : "border-[#1F4E8C] bg-[#1F4E8C] text-white"
                        : "border-[#D9D6CC] bg-white text-[#3F4753]"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </span>
            </div>
          ))}
        </fieldset>
      );
    }
    case "ticks": {
      const ticked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset className="text-sm">
          <legend className="mb-1">
            <Label field={field} />
          </legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {field.items.map((item) => (
              <label key={item} className="flex min-h-10 items-center gap-2 rounded-lg border border-[#E3E1DA] px-3">
                <input
                  type="checkbox"
                  checked={ticked.includes(item)}
                  onChange={(e) => onChange(e.target.checked ? [...ticked, item] : ticked.filter((t) => t !== item))}
                />
                {item}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    case "people":
      return <PeopleInput field={field} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
    case "risks":
      return <RisksInput field={field} value={Array.isArray(value) ? (value as RiskRow[]) : []} onChange={onChange} />;
  }
}

function PeopleInput({ field, value, onChange }: { field: Field; value: string[]; onChange: (v: unknown) => void }) {
  const [name, setName] = useState("");
  function add() {
    if (!name.trim()) return;
    onChange([...value, name.trim()]);
    setName("");
  }
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <Label field={field} />
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((p, i) => (
            <li key={`${p}-${i}`} className="flex items-center gap-1 rounded-full bg-[#E3ECF8] py-1 pl-3 pr-1 font-semibold text-[#163A69]">
              {p}
              <button type="button" aria-label={`Remove ${p}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded-full p-1 hover:bg-white/60">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          className={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Type a name"
        />
        <button type="button" onClick={add} className={secondaryBtn}>
          Add
        </button>
      </div>
    </div>
  );
}

function RisksInput({ field, value, onChange }: { field: Extract<Field, { kind: "risks" }> | Field; value: RiskRow[]; onChange: (v: unknown) => void }) {
  const rows = value.length ? value : [];
  const stepLabel = field.kind === "risks" ? field.stepLabel : "Step";
  const update = (i: number, patch: Partial<RiskRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2 text-sm">
      <Label field={field} />
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-lg border border-[#E3E1DA] bg-[#FAFAF8] p-3 sm:grid-cols-[1fr_1fr_1.4fr_8rem_auto]">
          <input className={input} value={r.step} onChange={(e) => update(i, { step: e.target.value })} placeholder={stepLabel} aria-label={stepLabel} />
          <input className={input} value={r.hazard} onChange={(e) => update(i, { hazard: e.target.value })} placeholder="Hazard / what could go wrong" aria-label="Hazard" />
          <input className={input} value={r.controls} onChange={(e) => update(i, { controls: e.target.value })} placeholder="Controls" aria-label="Controls" />
          <select className={input} value={r.risk} onChange={(e) => update(i, { risk: e.target.value as RiskRow["risk"] })} aria-label="Risk">
            <option value="">Risk…</option>
            {RISK_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          <button type="button" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="justify-self-end rounded-lg p-2 text-[#5B6472] hover:bg-white hover:text-[#B91C1C]">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { step: "", hazard: "", controls: "", risk: "" }])}
        className={`${secondaryBtn} self-start`}
      >
        <Plus className="h-4 w-4" /> Add {stepLabel.toLowerCase()}
      </button>
    </div>
  );
}
