"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtCurrency } from "@/lib/quotes/format";

export type AreaRow = {
  // null for the catch-all row of items that aren't in any area.
  id: string | null;
  name: string;
  category: "Interior" | "Exterior";
  hours: number;
  litres: number;
  // The area's painting price plus its own Access / Other items.
  price: number;
  selected: boolean;
};

const rowKey = (r: AreaRow) => r.id ?? "__no-area__";

// The figure columns keep to their contents (with roomy side padding) and sit
// at the right of the table.
const num = "whitespace-nowrap px-6";

// The Area table on the Summary page. Each row has a tick box; ticked areas
// show their price in "Repaint Price $ selected", which totals at the foot.
// Ticks are remembered per area (quote_buildings.summary_selected).
export function AreaSummaryTable({ rows }: { rows: AreaRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.selected).map(rowKey))
  );
  const [error, setError] = useState<string | null>(null);

  async function toggle(row: AreaRow, checked: boolean) {
    setError(null);
    const key = rowKey(row);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
    if (!row.id) return; // the catch-all row has nothing to save against

    const supabase = createClient();
    const { error: err } = await supabase
      .from("quote_buildings")
      .update({ summary_selected: checked })
      .eq("id", row.id);
    // The tick still works on screen; it just won't be there next visit.
    if (err) setError("Ticked, but it won't be remembered — couldn't save: " + err.message);
  }

  const totals = rows.reduce(
    (t, r) => ({
      hours: t.hours + r.hours,
      litres: t.litres + r.litres,
      price: t.price + r.price,
      selected: t.selected + (selected.has(rowKey(r)) ? r.price : 0),
    }),
    { hours: 0, litres: 0, price: 0, selected: 0 }
  );

  function group(label: "Interior" | "Exterior") {
    const inGroup = rows.filter((r) => r.category === label);
    if (inGroup.length === 0) return null;
    return (
      <>
        <tr className="border-b border-border bg-background/50">
          <td
            className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted"
            colSpan={6}
          >
            {label}
          </td>
        </tr>
        {inGroup.map((r) => {
          const on = selected.has(rowKey(r));
          return (
            <tr key={rowKey(r)} className="border-b border-border last:border-b-0">
              <td className="px-4 py-2.5 text-ink">{r.name}</td>
              <td className={`${num} py-2.5 text-muted`}>{r.hours.toFixed(1)}</td>
              <td className={`${num} py-2.5 text-muted`}>{r.litres.toFixed(1)}</td>
              <td className={`${num} py-2.5 font-medium text-ink`}>{fmtCurrency(r.price)}</td>
              <td className={`${num} py-2.5 font-medium text-ink`}>
                {on ? fmtCurrency(r.price) : ""}
              </td>
              <td className="px-4 py-2.5 text-center">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => toggle(r, e.target.checked)}
                  aria-label={`Include ${r.name} in the selected total`}
                  className="h-4 w-4 cursor-pointer accent-brand-red"
                />
              </td>
            </tr>
          );
        })}
      </>
    );
  }

  return (
    <div className="mb-6 overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
            {/* The Area column takes all the spare width, which pushes the
                figure columns over to the right. */}
            <th className="w-full px-4 py-3">Area</th>
            <th className={`${num} py-3`}>Repaint Hours</th>
            <th className={`${num} py-3`}>Repaint Litres</th>
            <th className={`${num} py-3`}>Repaint Price ($)</th>
            {/* "selected" drops to a second line so this column stays narrow. */}
            <th className={`${num} py-3`}>
              Repaint Price $<br />
              selected
            </th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {group("Interior")}
          {group("Exterior")}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-background/50 font-semibold text-ink">
            <td className="px-4 py-3">Totals</td>
            <td className={`${num} py-3`}>{totals.hours.toFixed(1)}</td>
            <td className={`${num} py-3`}>{totals.litres.toFixed(1)}</td>
            <td className={`${num} py-3`}>{fmtCurrency(totals.price)}</td>
            <td className={`${num} py-3`}>{fmtCurrency(totals.selected)}</td>
            <td className="px-4 py-3" />
          </tr>
        </tfoot>
      </table>
      {error && <p className="border-t border-border px-4 py-2 text-xs text-brand-red">{error}</p>}
    </div>
  );
}
