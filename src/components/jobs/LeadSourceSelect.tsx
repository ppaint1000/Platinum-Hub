"use client";

import { LEAD_SOURCES } from "@/lib/jobs/leadSources";

// Where the enquiry came from - on the add and edit job forms.
export function LeadSourceSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  // Keeps an older value that's since been taken off the list.
  const options = value && !(LEAD_SOURCES as readonly string[]).includes(value) ? [value, ...LEAD_SOURCES] : LEAD_SOURCES;
  return (
    <label className="flex flex-col gap-1 text-sm sm:col-span-2">
      <span className="text-ink-soft">Lead source</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border border-line px-2 py-1.5">
        <option value="">Not recorded</option>
        {options.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}
