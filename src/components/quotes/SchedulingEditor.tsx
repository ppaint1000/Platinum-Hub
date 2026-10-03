"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputClass } from "@/components/quotes/Modal";

// The Scheduling box from the Excel summary: crew size and hours per week
// are typed in, and the projected duration follows from the job's total
// hours — (total hours / hours per week) / number of men, shown to the
// nearest whole week like the spreadsheet does.
export function SchedulingEditor({
  quoteId,
  initialMen,
  initialHoursPerWeek,
  totalHours,
}: {
  quoteId: string;
  initialMen: number;
  initialHoursPerWeek: number;
  totalHours: number;
}) {
  const router = useRouter();
  const [men, setMen] = useState(String(initialMen));
  const [hoursPerWeek, setHoursPerWeek] = useState(String(initialHoursPerWeek));
  const [error, setError] = useState<string | null>(null);

  const menNum = Number(men) || 0;
  const hoursNum = Number(hoursPerWeek) || 0;
  const weeks = menNum > 0 && hoursNum > 0 ? totalHours / hoursNum / menNum : 0;

  async function save() {
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase
      .from("quotes")
      .update({ schedule_men: menNum, schedule_hours_per_week: hoursNum })
      .eq("id", quoteId);
    if (err) return setError("Couldn't save — " + err.message);
    router.refresh();
  }

  return (
    <div data-no-spinner className="w-full flex-1 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-ink">Scheduling</h2>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-ink">
        <label className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="1"
            className={inputClass + " w-16 bg-amber-50 text-right"}
            value={men}
            onChange={(e) => setMen(e.target.value)}
            onBlur={save}
          />
          Number of Men
        </label>
        <label className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="1"
            className={inputClass + " w-16 bg-amber-50 text-right"}
            value={hoursPerWeek}
            onChange={(e) => setHoursPerWeek(e.target.value)}
            onBlur={save}
          />
          Hours per week
        </label>
        <span className="text-muted">=</span>
        <span className="flex items-center gap-2">
          <span className="min-w-14 rounded-lg bg-orange-500 px-3 py-2 text-center font-semibold text-white">
            {Math.round(weeks)}
          </span>
          Weeks - projected duration
        </span>
      </div>
      {error && <p className="mt-2 text-xs text-brand-red">{error}</p>}
    </div>
  );
}
