"use client";

// Enter what was spent on each lead source in a month - ads, Google,
// Facebook, signage, website costs. Blank or 0 clears it.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSpendAction } from "@/app/reports/marketing/actions";
import type { SpendRow } from "@/lib/reports/marketing";

const input = "min-h-10 w-full rounded-lg border border-[#D9D6CC] bg-white px-3 text-sm text-[#16202E] focus:border-[#1F4E8C] focus:outline-none";

export function SpendEditor({ sources, spend, defaultMonth }: { sources: readonly string[]; spend: SpendRow[]; defaultMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const saved = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of spend) if (s.month.slice(0, 7) === month) m.set(s.source, s.amount);
    return m;
  }, [spend, month]);
  const [values, setValues] = useState<Record<string, string>>({});
  const valueOf = (s: string) => values[`${month}|${s}`] ?? (saved.get(s) ? String(saved.get(s)) : "");
  const total = sources.reduce((t, s) => t + (parseFloat(valueOf(s)) || 0), 0);

  function save() {
    setMessage("");
    startTransition(async () => {
      const amounts = Object.fromEntries(sources.map((s) => [s, parseFloat(valueOf(s)) || 0]));
      const r = await saveSpendAction(month, amounts);
      setMessage(r.error ?? "Saved.");
      if (!r.error) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold text-[#3F4753]">
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={input} />
        </label>
        <p className="pb-2 text-sm text-[#5B6472]">
          Total for the month: <span className="font-semibold text-[#16202E]">${total.toLocaleString("en-NZ", { maximumFractionDigits: 2 })}</span>
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((s) => (
          <label key={s} className="flex flex-col gap-1 text-sm font-semibold text-[#3F4753]">
            {s}
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="0"
              value={valueOf(s)}
              onChange={(e) => setValues({ ...values, [`${month}|${s}`]: e.target.value })}
              className={input}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="min-h-11 rounded-lg bg-[#16202E] px-4 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save spend"}
        </button>
        {message && <span className={`text-sm ${message === "Saved." ? "text-green-700" : "text-[#B91C1C]"}`}>{message}</span>}
      </div>
    </div>
  );
}
