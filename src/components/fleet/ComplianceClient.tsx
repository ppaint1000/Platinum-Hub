"use client";

import { useState } from "react";
import { ExpiryChip } from "@/components/fleet/StatusChip";
import { daysUntil, fmtDate } from "@/lib/fleet/format";

type Vehicle = {
  id: string;
  plate: string;
  make: string;
  model: string;
  wof_expiry: string | null;
  rego_expiry: string | null;
};

type Filter = "all" | "soon" | "overdue";

export function ComplianceClient({ vehicles }: { vehicles: Vehicle[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const sorted = [...vehicles].sort((a, b) => {
    const da = Math.min(
      daysUntil(a.wof_expiry) ?? Infinity,
      daysUntil(a.rego_expiry) ?? Infinity
    );
    const db = Math.min(
      daysUntil(b.wof_expiry) ?? Infinity,
      daysUntil(b.rego_expiry) ?? Infinity
    );
    return da - db;
  });

  const rows = sorted.filter((v) => {
    if (filter === "all") return true;
    const dw = daysUntil(v.wof_expiry);
    const dr = daysUntil(v.rego_expiry);
    if (filter === "overdue") return (dw !== null && dw < 0) || (dr !== null && dr < 0);
    return (dw !== null && dw >= 0 && dw <= 30) || (dr !== null && dr >= 0 && dr <= 30);
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">WOF &amp; Registration</h1>
        <p className="mt-1 text-sm text-muted">
          Warrant of fitness and registration status for every vehicle
        </p>
      </div>

      <div className="mb-4 flex gap-2">
        {(
          [
            ["all", "All vehicles"],
            ["soon", "Due within 30 days"],
            ["overdue", "Overdue"],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              filter === key
                ? "border-ink bg-ink text-white"
                : "border-border bg-surface text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            {vehicles.length === 0 ? "No vehicles yet." : "Nothing matches this filter."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Vehicle</th>
                <th className="px-5 py-3">Plate</th>
                <th className="px-5 py-3">WOF expiry</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Rego expiry</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-b-0 hover:bg-background">
                  <td className="whitespace-nowrap px-5 py-3">
                    {v.make} {v.model}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs">{v.plate}</td>
                  <td className="whitespace-nowrap px-5 py-3">{fmtDate(v.wof_expiry)}</td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <ExpiryChip date={v.wof_expiry} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">{fmtDate(v.rego_expiry)}</td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <ExpiryChip date={v.rego_expiry} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
