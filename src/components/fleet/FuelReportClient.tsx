"use client";

import { useMemo, useState } from "react";
import { fillUpsForVehicle, totalsFor, type FillUp, type FuelEntryInput, type Totals } from "@/lib/fleet/fuelEconomy";
import { fmtDate, fmtMoney } from "@/lib/fleet/format";

type VehicleOption = { id: string; name: string };

// Single series throughout (one measure, $/km), so one hue and no legend -
// the chart titles say what's plotted. Validated (dataviz
// validate_palette.js) against the Fleet surface (#ffffff): passes the
// lightness, chroma and 3:1 contrast checks. Text never uses it.
const SERIES = "#2a78d6";

const PERIODS = [
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "3m", label: "Last 3 months", days: 91 },
  { key: "12m", label: "Last 12 months", days: 365 },
  { key: "all", label: "All time", days: null },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

function periodStart(key: PeriodKey): string | null {
  const days = PERIODS.find((p) => p.key === key)!.days;
  if (days === null) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function perKm(n: number | null) {
  return n === null ? "—" : `$${n.toFixed(2)}/km`;
}

function km(n: number) {
  return `${Math.round(n).toLocaleString("en-NZ")} km`;
}

// Clean axis max + ticks (0 / 0.10 / 0.20 …) for a $/km scale.
function niceScale(max: number): { max: number; ticks: number[] } {
  if (max <= 0) return { max: 1, ticks: [0, 0.5, 1] };
  const rough = max / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough)!;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step / 2; t += step) ticks.push(Number(t.toFixed(6)));
  return { max: top, ticks };
}

type Tip = { x: number; y: number; title: string; lines: string[] } | null;

export function FuelReportClient({
  vehicles,
  entries,
}: {
  vehicles: VehicleOption[];
  entries: FuelEntryInput[];
}) {
  const [period, setPeriod] = useState<PeriodKey>("12m");
  const [vehicleId, setVehicleId] = useState<string>("");

  // Fill-ups are worked out over each vehicle's whole history (so the
  // first fill inside the period still measures from the one before it),
  // then trimmed to the period.
  const byVehicle = useMemo(() => {
    const start = periodStart(period);
    return vehicles.map((v) => {
      const fills = fillUpsForVehicle(entries.filter((e) => e.vehicle_id === v.id)).filter(
        (f) => start === null || f.fuelledOn >= start
      );
      return { ...v, fills, totals: totalsFor(fills) };
    });
  }, [vehicles, entries, period]);

  const selected = byVehicle.find((v) => v.id === vehicleId) ?? null;
  const fleetTotals = useMemo(() => totalsFor(byVehicle.flatMap((v) => v.fills)), [byVehicle]);
  const shownTotals = selected ? selected.totals : fleetTotals;
  const ranked = [...byVehicle]
    .filter((v) => v.totals.costPerKm !== null)
    .sort((a, b) => b.totals.costPerKm! - a.totals.costPerKm!);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Fuel Report</h1>
        <p className="mt-1 text-sm text-muted">
          Fuel cost per km, worked out from the km driven between fill-ups.
        </p>
      </div>

      {/* Filters: one row, above everything they affect. */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-border bg-surface p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                period === p.key ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <select
          value={vehicleId}
          onChange={(e) => setVehicleId(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
        >
          <option value="">All vehicles</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cost per km" value={perKm(shownTotals.costPerKm)} />
        <Stat label="Km driven" value={km(shownTotals.km)} />
        <Stat label="Fuel cost" value={fmtMoney(shownTotals.cost)} />
        <Stat
          label="Economy"
          value={shownTotals.litresPer100Km === null ? "—" : `${shownTotals.litresPer100Km.toFixed(1)} L/100km`}
        />
      </div>

      {selected ? (
        <VehicleDetail name={selected.name} fills={selected.fills} totals={selected.totals} />
      ) : (
        <FleetOverview ranked={ranked} all={byVehicle} fleetCostPerKm={fleetTotals.costPerKm} onPick={setVehicleId} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <p className="mt-2 whitespace-nowrap text-xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 w-max max-w-[16rem] -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
      style={{ left: tip.x, top: tip.y - 8 }}
    >
      <p className="font-semibold text-ink">{tip.title}</p>
      {tip.lines.map((l) => (
        <p key={l} className="tabular-nums text-muted">
          {l}
        </p>
      ))}
    </div>
  );
}

// Tooltip position relative to the chart box, from the hovered mark.
function tipAt(e: React.MouseEvent | React.FocusEvent, box: HTMLElement | null) {
  const mark = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const outer = box?.getBoundingClientRect();
  return { x: mark.left + mark.width / 2 - (outer?.left ?? 0), y: mark.top - (outer?.top ?? 0) };
}

type Ranked = VehicleOption & { fills: FillUp[]; totals: Totals };

// ── Whole period: one bar per vehicle ────────────────────────────────────
function FleetOverview({
  ranked,
  all,
  fleetCostPerKm,
  onPick,
}: {
  ranked: Ranked[];
  all: Ranked[];
  fleetCostPerKm: number | null;
  onPick: (id: string) => void;
}) {
  const [tip, setTip] = useState<Tip>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const scale = niceScale(Math.max(0, ...ranked.map((v) => v.totals.costPerKm!)));

  return (
    <>
      <section className="mb-6 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Cost per km by vehicle</h2>
        <p className="mb-4 text-xs text-muted">
          Whole period. Hover a bar for details, or click it to see that vehicle&apos;s fill-ups.
          {fleetCostPerKm !== null && ` Fleet average ${perKm(fleetCostPerKm)}.`}
        </p>
        {ranked.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            Not enough fill-ups yet — a vehicle needs at least two with odometer readings in this period.
          </p>
        ) : (
          <div ref={setBox} className="relative">
            <div className="flex flex-col gap-2">
              {ranked.map((v) => {
                const pct = (v.totals.costPerKm! / scale.max) * 100;
                return (
                  <div key={v.id} className="flex items-center gap-3">
                    <span className="w-40 flex-none truncate text-right text-xs text-muted sm:w-56" title={v.name}>
                      {v.name}
                    </span>
                    {/* Right margin keeps room for the value label past the longest bar. */}
                    <div className="relative mr-20 h-6 flex-1">
                      <button
                        type="button"
                        aria-label={`${v.name}: ${perKm(v.totals.costPerKm)}`}
                        onClick={() => onPick(v.id)}
                        onMouseEnter={(e) => setTip(vehicleTip(v, e, box))}
                        onFocus={(e) => setTip(vehicleTip(v, e, box))}
                        onMouseLeave={() => setTip(null)}
                        onBlur={() => setTip(null)}
                        // Hit target is the full row height; the drawn bar is thinner.
                        className="group absolute inset-y-0 left-0 flex items-center outline-none"
                        style={{ width: `max(${pct}%, 4px)` }}
                      >
                        <span
                          className="h-4 w-full rounded-r-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-ink"
                          style={{ background: SERIES }}
                        />
                      </button>
                      <span
                        className="pointer-events-none absolute top-1/2 -translate-y-1/2 pl-2 text-xs tabular-nums text-ink"
                        style={{ left: `${pct}%` }}
                      >
                        {perKm(v.totals.costPerKm)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <Tooltip tip={tip} />
          </div>
        )}
      </section>

      <section className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="whitespace-nowrap border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-5 py-3">Vehicle</th>
              <th className="px-5 py-3 text-right">Fill-ups</th>
              <th className="px-5 py-3 text-right">Km</th>
              <th className="px-5 py-3 text-right">Litres</th>
              <th className="px-5 py-3 text-right">Fuel cost</th>
              <th className="px-5 py-3 text-right">Cost / km</th>
              <th className="px-5 py-3 text-right">L/100km</th>
            </tr>
          </thead>
          <tbody>
            {all.map((v) => (
              <tr
                key={v.id}
                onClick={() => onPick(v.id)}
                className="cursor-pointer border-b border-border last:border-b-0 hover:bg-background"
              >
                <td className="whitespace-nowrap px-5 py-3 text-ink">{v.name}</td>
                {v.totals.fills === 0 ? (
                  <td colSpan={6} className="px-5 py-3 text-right text-xs text-muted">
                    Not enough fill-ups in this period
                  </td>
                ) : (
                  <>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{v.totals.fills}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{km(v.totals.km)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{v.totals.litres.toFixed(1)} L</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{fmtMoney(v.totals.cost)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{perKm(v.totals.costPerKm)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{v.totals.litresPer100Km!.toFixed(1)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function vehicleTip(v: Ranked, e: React.MouseEvent | React.FocusEvent, box: HTMLElement | null): Tip {
  return {
    ...tipAt(e, box),
    title: v.name,
    lines: [
      `${perKm(v.totals.costPerKm)} · ${v.totals.litresPer100Km!.toFixed(1)} L/100km`,
      `${km(v.totals.km)} · ${fmtMoney(v.totals.cost)} · ${v.totals.litres.toFixed(1)} L`,
      `${v.totals.fills} fill-up${v.totals.fills === 1 ? "" : "s"}`,
    ],
  };
}

// ── One vehicle: a column per fill-up, with the period average ──────────
function VehicleDetail({ name, fills, totals }: { name: string; fills: FillUp[]; totals: Totals }) {
  const [tip, setTip] = useState<Tip>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const scale = niceScale(Math.max(0, ...fills.map((f) => f.costPerKm)));
  const HEIGHT = 200;
  // Label the first and last fill-ups plus every few in between, not all.
  const labelEvery = Math.max(1, Math.ceil(fills.length / 6));

  return (
    <>
      <section className="mb-6 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Cost per km at each fill-up — {name}</h2>
        <p className="mb-4 text-xs text-muted">
          Each column is the km driven since the previous fill-up. Hover for details.
        </p>
        {fills.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">
            Not enough fill-ups yet — this vehicle needs at least two with odometer readings in this period.
          </p>
        ) : (
          // Tooltip is positioned against this outer box, outside the
          // scrolling area below, so it is never clipped by it.
          <div ref={setBox} className="relative flex gap-2">
            {/* y-axis ticks */}
            <div className="relative mt-4 w-12 flex-none" style={{ height: HEIGHT }}>
              {scale.ticks.map((t) => (
                <span
                  key={t}
                  className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-muted"
                  style={{ top: HEIGHT - (t / scale.max) * HEIGHT }}
                >
                  ${t.toFixed(2)}
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden pt-4">
              <div className="relative" style={{ minWidth: fills.length * 16 }}>
                <div className="relative" style={{ height: HEIGHT }}>
                  {scale.ticks.map((t) => (
                    <div
                      key={t}
                      className="absolute inset-x-0 border-t border-border"
                      style={{ top: HEIGHT - (t / scale.max) * HEIGHT }}
                    />
                  ))}
                  <div className="absolute inset-0 flex items-end gap-[2px]">
                    {fills.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        aria-label={`${fmtDate(f.fuelledOn)}: ${perKm(f.costPerKm)}`}
                        onMouseEnter={(e) => setTip(fillTip(f, e, box))}
                        onFocus={(e) => setTip(fillTip(f, e, box))}
                        onMouseLeave={() => setTip(null)}
                        onBlur={() => setTip(null)}
                        // Full-height hit target; the drawn column sits at the bottom.
                        className="group flex h-full min-w-[12px] flex-1 items-end justify-center outline-none"
                      >
                        <span
                          className="w-full max-w-[24px] rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-ink"
                          style={{ height: `${(f.costPerKm / scale.max) * 100}%`, background: SERIES }}
                        />
                      </button>
                    ))}
                  </div>
                  {totals.costPerKm !== null && (
                    <div
                      className="pointer-events-none absolute inset-x-0 border-t border-ink"
                      style={{ top: HEIGHT - (totals.costPerKm / scale.max) * HEIGHT }}
                    >
                      <span className="absolute right-0 -translate-y-full bg-surface/90 px-1 text-[11px] text-ink">
                        Average {perKm(totals.costPerKm)}
                      </span>
                    </div>
                  )}
                </div>
                {/* Date labels float over their column so a label wider than
                    its column never widens the chart; the first and last are
                    pinned to the edges so they don't hang off either end. */}
                <div className="mt-1 flex h-4 gap-[2px]">
                  {fills.map((f, i) => {
                    const last = i === fills.length - 1;
                    const shown = i % labelEvery === 0 || last;
                    return (
                      <span key={f.id} className="relative min-w-[12px] flex-1">
                        {shown && (
                          <span
                            className={`absolute top-0 whitespace-nowrap text-[11px] text-muted ${
                              i === 0 ? "left-0" : last ? "right-0" : "left-1/2 -translate-x-1/2"
                            }`}
                          >
                            {new Date(f.fuelledOn + "T00:00:00").toLocaleDateString("en-NZ", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
            <Tooltip tip={tip} />
          </div>
        )}
      </section>

      <section className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="whitespace-nowrap border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3 text-right">Odometer</th>
              <th className="px-5 py-3 text-right">Km since last</th>
              <th className="px-5 py-3 text-right">Litres</th>
              <th className="px-5 py-3 text-right">Fuel cost</th>
              <th className="px-5 py-3 text-right">Cost / km</th>
              <th className="px-5 py-3 text-right">L/100km</th>
            </tr>
          </thead>
          <tbody>
            {[...fills].reverse().map((f) => (
              <tr key={f.id} className="border-b border-border last:border-b-0">
                <td className="whitespace-nowrap px-5 py-3 text-ink">{fmtDate(f.fuelledOn)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{km(f.odometerKm)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{km(f.km)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{f.litres.toFixed(1)} L</td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{fmtMoney(f.cost)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{perKm(f.costPerKm)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{f.litresPer100Km.toFixed(1)}</td>
              </tr>
            ))}
            {fills.length > 0 && (
              <tr className="bg-background font-semibold">
                <td className="px-5 py-3 text-ink">Whole period</td>
                <td />
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{km(totals.km)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{totals.litres.toFixed(1)} L</td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{fmtMoney(totals.cost)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{perKm(totals.costPerKm)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">{totals.litresPer100Km?.toFixed(1) ?? "—"}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

function fillTip(f: FillUp, e: React.MouseEvent | React.FocusEvent, box: HTMLElement | null): Tip {
  return {
    ...tipAt(e, box),
    title: fmtDate(f.fuelledOn),
    lines: [
      `${perKm(f.costPerKm)} · ${f.litresPer100Km.toFixed(1)} L/100km`,
      `${km(f.km)} since last fill-up`,
      `${f.litres.toFixed(1)} L for ${fmtMoney(f.cost)}`,
    ],
  };
}
