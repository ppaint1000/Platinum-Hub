// A card per vehicle with two rings: km per month and fuel economy. Each
// ring is a gauge against the fleet average - the tick at the top is the
// average, a full ring is twice it - and turns red when the vehicle is more
// than 10% either side of it. Dashboard colours (components/dashboard/parts).
import { BLUE, RED } from "@/components/dashboard/parts";
import { USAGE_TOLERANCE, isOutside, offAverage, type FleetUsage } from "@/lib/fleet/usage";

type VehicleLike = { id: string; plate: string; make: string; model: string };

const SIZE = 104;
const STROKE = 11;

function Gauge({
  label,
  value,
  average,
  unit,
  digits,
}: {
  label: string;
  value: number | null;
  average: number | null;
  unit: string;
  digits: number;
}) {
  const r = (SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const off = offAverage(value, average);
  const red = isOutside(off);
  const colour = red ? RED : BLUE;
  // Half the ring = the fleet average.
  const share = value === null || !average ? 0 : Math.max(0, Math.min(1, value / (average * 2)));
  const fmt = (n: number) => n.toLocaleString("en-NZ", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const offText =
    off === null ? "Not enough fill-ups yet" : Math.abs(off) < 0.005 ? "On the fleet average" : `${Math.round(Math.abs(off) * 100)}% ${off > 0 ? "above" : "below"} average`;

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="text-xs font-semibold text-[#5B6472]">{label}</span>
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`${label}: ${value === null ? "no data" : `${fmt(value)} ${unit}`}, ${offText}`}
        >
          <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="#ECEAE3" strokeWidth={STROKE} />
          {share > 0 && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={r}
              fill="none"
              stroke={colour}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${share * c} ${c}`}
              // Starts at the bottom, so half-way (the average) is the top.
              transform={`rotate(90 ${SIZE / 2} ${SIZE / 2})`}
            />
          )}
          {/* The fleet average */}
          <line
            x1={SIZE / 2}
            y1={STROKE / 2 - 3}
            x2={SIZE / 2}
            y2={STROKE + 3}
            stroke="#16202E"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold leading-none text-[#16202E]">{value === null ? "—" : fmt(value)}</span>
          <span className="mt-0.5 text-[11px] text-[#5B6472]">{unit}</span>
        </div>
      </div>
      <span className={`text-xs ${red ? "font-semibold" : "text-[#5B6472]"}`} style={red ? { color: RED } : undefined}>
        {offText}
      </span>
    </div>
  );
}

export function UsageRings({ vehicles, usage }: { vehicles: VehicleLike[]; usage: FleetUsage }) {
  if (vehicles.length === 0) return null;
  const sorted = [...vehicles].sort((a, b) => a.plate.localeCompare(b.plate));
  const fmtAvg = (n: number | null, digits: number, unit: string) =>
    n === null ? "—" : `${n.toLocaleString("en-NZ", { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${unit}`;

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-ink">Kilometres and fuel by vehicle</h2>
        <p className="text-xs text-muted">
          Fleet average {fmtAvg(usage.avgKmPerMonth, 0, "km/month")} · {fmtAvg(usage.avgLPer100km, 1, "L/100km")} · last
          12 months
        </p>
      </div>
      <ul className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((v) => {
          const u = usage.vehicles.get(v.id);
          const kmRed = isOutside(offAverage(u?.kmPerMonth ?? null, usage.avgKmPerMonth));
          const fuelRed = isOutside(offAverage(u?.lPer100km ?? null, usage.avgLPer100km));
          return (
            <li key={v.id} className="bg-surface px-5 py-4">
              <p className="text-sm font-medium text-ink">
                {v.make} {v.model} — {v.plate}
                {(kmRed || fuelRed) && (
                  <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: RED }}>
                    Check
                  </span>
                )}
              </p>
              <div className="mt-3 flex justify-around gap-3">
                <Gauge label="Km per month" value={u?.kmPerMonth ?? null} average={usage.avgKmPerMonth} unit="km/mo" digits={0} />
                <Gauge label="Fuel economy" value={u?.lPer100km ?? null} average={usage.avgLPer100km} unit="L/100km" digits={1} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-border px-5 py-3 text-xs text-muted">
        The tick at the top of each ring is the fleet average. Red means more than {Math.round(USAGE_TOLERANCE * 100)}%
        above or below it. Worked out from fuel-log odometer readings.
      </p>
    </div>
  );
}
