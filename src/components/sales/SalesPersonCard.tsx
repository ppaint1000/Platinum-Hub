"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, Money } from "@/components/ui";
import { updateSalesTargetAction } from "@/app/sales/actions";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type MonthlyFigures = {
  budgetQuoted: number[]; // 12 entries each, in the same order as `months`
  quoted: number[];
  budgetWon: number[];
  won: number[];
};

function sum(values: number[], upToInclusive?: number): number {
  const slice = upToInclusive === undefined ? values : values.slice(0, upToInclusive + 1);
  return slice.reduce((s, n) => s + n, 0);
}

function pct(actual: number, budget: number): number | null {
  return budget > 0 ? (actual / budget) * 100 : null;
}

function fmtPct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

export function SalesPersonCard({
  name,
  userId,
  label,
  months,
  currentMonthIndex,
  figures,
  canEditBudget,
}: {
  name: string;
  userId: string;
  label: string;
  months: { year: number; month: number }[];
  currentMonthIndex: number;
  figures: MonthlyFigures;
  canEditBudget: boolean;
}) {
  const annualBudgetQuoted = sum(figures.budgetQuoted);
  const annualQuoted = sum(figures.quoted);
  const annualBudgetWon = sum(figures.budgetWon);
  const annualWon = sum(figures.won);

  // "Year to date %" paces actual against how much budget has elapsed so
  // far (are we on track for where we should be by now); "% of annual
  // budget" instead divides by the FULL year's budget regardless of how
  // far through the year we are (how much of the whole year's target is
  // already banked) - both are driven off the same yearly budget figures.
  const rows = [
    {
      label: "Quoted",
      yearlyBudget: annualBudgetQuoted,
      thisMonth: pct(figures.quoted[currentMonthIndex], figures.budgetQuoted[currentMonthIndex]),
      yearToDate: pct(sum(figures.quoted, currentMonthIndex), sum(figures.budgetQuoted, currentMonthIndex)),
      ofAnnualBudget: pct(annualQuoted, annualBudgetQuoted),
    },
    {
      label: "Sales (won)",
      yearlyBudget: annualBudgetWon,
      thisMonth: pct(figures.won[currentMonthIndex], figures.budgetWon[currentMonthIndex]),
      yearToDate: pct(sum(figures.won, currentMonthIndex), sum(figures.budgetWon, currentMonthIndex)),
      ofAnnualBudget: pct(annualWon, annualBudgetWon),
    },
  ];

  return (
    <Panel className="mb-6 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{name}</h2>
        <table className="text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              <th className="pr-3 text-left"></th>
              <th className="px-3 text-right">Yearly budget</th>
              <th className="px-3 text-right">This month %</th>
              <th className="px-3 text-right">Year to date %</th>
              <th className="px-3 text-right">% of annual budget</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="pr-3 text-ink-soft">{r.label}</td>
                <td className="px-3 text-right font-medium text-ink">
                  <Money value={r.yearlyBudget} />
                </td>
                <td className="px-3 text-right font-medium text-ink">{fmtPct(r.thisMonth)}</td>
                <td className="px-3 text-right font-medium text-ink">{fmtPct(r.yearToDate)}</td>
                <td className="px-3 text-right font-medium text-ink">{fmtPct(r.ofAnnualBudget)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink-faint">
              <th className="py-2">{label}</th>
              {months.map((m) => (
                <th key={`${m.year}-${m.month}`} className="px-2 py-2 text-right">
                  {MONTH_NAMES[m.month - 1]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="py-2 text-ink-soft">Budget quoted</td>
              {figures.budgetQuoted.map((amount, i) => (
                <td key={i} className="px-2 py-2 text-right">
                  {canEditBudget ? (
                    <BudgetCell
                      userId={userId}
                      year={months[i].year}
                      month={months[i].month}
                      field="quoted"
                      amount={amount}
                    />
                  ) : (
                    <Money value={amount} />
                  )}
                </td>
              ))}
            </tr>
            <tr className="border-b border-line">
              <td className="py-2 text-ink-soft">Actual quoted</td>
              {figures.quoted.map((amount, i) => (
                <td key={i} className="px-2 py-2 text-right">
                  <Money value={amount} />
                </td>
              ))}
            </tr>
            <tr className="border-b border-line">
              <td className="py-2 text-ink-soft">% of quoted budget</td>
              {figures.quoted.map((amount, i) => (
                <td key={i} className="px-2 py-2 text-right text-ink-soft">
                  {fmtPct(pct(amount, figures.budgetQuoted[i]))}
                </td>
              ))}
            </tr>
            <tr className="border-b border-line">
              <td className="py-2 text-ink-soft">Sales budget</td>
              {figures.budgetWon.map((amount, i) => (
                <td key={i} className="px-2 py-2 text-right">
                  {canEditBudget ? (
                    <BudgetCell
                      userId={userId}
                      year={months[i].year}
                      month={months[i].month}
                      field="won"
                      amount={amount}
                    />
                  ) : (
                    <Money value={amount} />
                  )}
                </td>
              ))}
            </tr>
            <tr className="border-b border-line">
              <td className="py-2 text-ink-soft">Sales won</td>
              {figures.won.map((amount, i) => (
                <td key={i} className="px-2 py-2 text-right">
                  <Money value={amount} />
                </td>
              ))}
            </tr>
            <tr>
              <td className="py-2 text-ink-soft">% of sales budget</td>
              {figures.won.map((amount, i) => (
                <td key={i} className="px-2 py-2 text-right text-ink-soft">
                  {fmtPct(pct(amount, figures.budgetWon[i]))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function BudgetCell({
  userId,
  year,
  month,
  field,
  amount,
}: {
  userId: string;
  year: number;
  month: number;
  field: "quoted" | "won";
  amount: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(amount || ""));
  const [saving, setSaving] = useState(false);

  async function save() {
    const next = Number(value) || 0;
    if (next === amount) return;
    setSaving(true);
    await updateSalesTargetAction(userId, year, month, field, next);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="relative inline-block">
      <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-ink-faint">
        $
      </span>
      <input
        type="number"
        step="0.01"
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        className="w-24 rounded border border-line py-1 pl-4 pr-1.5 text-right text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </div>
  );
}
