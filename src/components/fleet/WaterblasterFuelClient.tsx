"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { fmtDate, fmtMoney } from "@/lib/fleet/format";
import { EditFuelEntryButton, type EditableFuelEntry } from "@/components/fleet/AddFuelEntryButton";
import {
  PERIOD_KINDS,
  currentPeriodName,
  periodKey,
  periodLabel,
  todayNZ,
  type PeriodKind,
} from "@/lib/fleet/waterblasterPeriods";

export type WaterblasterRow = {
  id: string;
  fuelled_on: string;
  driver: string | null;
  job: string | null;
  litres: number | null;
  cost: number | null;
  receiptUrl: string | null;
  entry: EditableFuelEntry;
};

type EditLists = Omit<React.ComponentProps<typeof EditFuelEntryButton>, "entry">;

const fmtLitres = (n: number) => `${n.toFixed(2)} L`;

// Rows arrive newest first. Groups them by period and gives each row the
// running total for its period up to and including that fill-up - so the
// top row of a period shows the period's total so far.
export function WaterblasterFuelClient({ rows, editLists }: { rows: WaterblasterRow[]; editLists: EditLists | null }) {
  const [kind, setKind] = useState<PeriodKind>("month");

  const summary = useMemo(() => {
    const today = todayNZ();
    return PERIOD_KINDS.map(({ kind: k }) => {
      const current = periodKey(today, k);
      const inPeriod = rows.filter((r) => periodKey(r.fuelled_on, k) === current);
      return {
        kind: k,
        name: currentPeriodName(k),
        label: periodLabel(current, k),
        cost: inPeriod.reduce((sum, r) => sum + (r.cost ?? 0), 0),
        litres: inPeriod.reduce((sum, r) => sum + (r.litres ?? 0), 0),
        count: inPeriod.length,
      };
    });
  }, [rows]);

  const groups = useMemo(() => {
    const byKey = new Map<string, WaterblasterRow[]>();
    for (const r of rows) {
      const key = periodKey(r.fuelled_on, kind);
      byKey.set(key, [...(byKey.get(key) ?? []), r]);
    }
    return [...byKey.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, list]) => {
        // Running total, oldest to newest within the period.
        const running = new Map<string, number>();
        let total = 0;
        for (const r of [...list].reverse()) {
          total += r.cost ?? 0;
          running.set(r.id, total);
        }
        return {
          key,
          label: periodLabel(key, kind),
          rows: list,
          running,
          cost: total,
          litres: list.reduce((sum, r) => sum + (r.litres ?? 0), 0),
        };
      });
  }, [rows, kind]);

  const missingCount = rows.filter((r) => r.cost == null || r.litres == null).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((s) => (
          <div key={s.kind} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{s.name}</p>
            <p className="mt-1 text-xl font-semibold text-ink">{fmtMoney(s.cost)}</p>
            <p className="mt-0.5 text-xs text-muted">
              {fmtLitres(s.litres)} · {s.count} fill-up{s.count === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {missingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-none" />
          {missingCount} {missingCount === 1 ? "fill-up is" : "fill-ups are"} missing litres or cost, so the totals
          leave {missingCount === 1 ? "it" : "them"} out{editLists ? " — fill them in with the edit button" : ""}.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Totals by</span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface p-1">
          {PERIOD_KINDS.map((p) => (
            <button
              key={p.kind}
              type="button"
              onClick={() => setKind(p.kind)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                kind === p.kind ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-5 py-10 text-center text-sm text-muted shadow-sm">
          No waterblaster fuel logged yet.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-background px-5 py-3">
              <h2 className="text-sm font-semibold text-ink">{g.label}</h2>
              <p className="text-sm text-muted">
                <span className="font-semibold text-ink">{fmtMoney(g.cost)}</span> · {fmtLitres(g.litres)} ·{" "}
                {g.rows.length} fill-up{g.rows.length === 1 ? "" : "s"}
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-5 py-2.5">Who</th>
                    <th className="px-5 py-2.5">Job</th>
                    <th className="px-5 py-2.5 text-right">Litres</th>
                    <th className="px-5 py-2.5 text-right">Amount</th>
                    <th className="px-5 py-2.5 text-right">Running total</th>
                    <th className="px-5 py-2.5">Receipt</th>
                    {editLists && <th className="px-3 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-background">
                      <td className="whitespace-nowrap px-5 py-3">{fmtDate(r.fuelled_on)}</td>
                      <td className="whitespace-nowrap px-5 py-3">{r.driver ?? "—"}</td>
                      <td className="min-w-48 px-5 py-3">{r.job ?? <span className="text-muted">—</span>}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        {r.litres != null ? fmtLitres(r.litres) : <span className="text-amber-700">Missing</span>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        {r.cost != null ? fmtMoney(r.cost) : <span className="text-amber-700">Missing</span>}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-medium text-ink">
                        {fmtMoney(g.running.get(r.id))}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3">
                        {r.receiptUrl ? (
                          <a
                            href={r.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-brand-red-dark underline underline-offset-2"
                          >
                            Receipt
                          </a>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                      {editLists && (
                        <td className="px-3 py-3">
                          <EditFuelEntryButton entry={r.entry} {...editLists} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
