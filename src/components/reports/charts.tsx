// Report charts - plain SVG in the dashboard colours (no chart library).
// Each is a white card with a title, like PaintScout's report charts.
import { BLUE, NAVY, QUOTED_FILL, RED } from "@/components/dashboard/parts";

export type Format = "money" | "count" | "pct" | "hours";

// Series colours, in order: blues and greys from our scheme, red last.
export const SERIES_COLOURS = [BLUE, NAVY, QUOTED_FILL, "#5B6472", "#C9CDD3", "#163A69", RED];

export function fmtValue(n: number, format: Format): string {
  switch (format) {
    case "money":
      return "$" + Math.round(n).toLocaleString("en-NZ");
    case "pct":
      return `${Math.round(n * 100)}%`;
    case "hours":
      return `${(Math.round(n * 10) / 10).toLocaleString("en-NZ")} hrs`;
    default:
      return Math.round(n).toLocaleString("en-NZ");
  }
}

// Short axis labels: $12k, 1.2k.
function fmtAxis(n: number, format: Format): string {
  if (format === "pct") return `${Math.round(n * 100)}%`;
  const abs = Math.abs(n);
  const short = abs >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}m` : abs >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`;
  return format === "money" ? `$${short}` : short;
}

function niceMax(max: number, format: Format): number {
  if (format === "pct") return Math.max(1, Math.ceil(max * 4) / 4);
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const steps = [1, 2, 2.5, 5, 10];
  for (const s of steps) if (max <= s * pow) return s * pow;
  return 10 * pow;
}

function ChartCard({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <figure className="flex flex-col gap-3 rounded-xl border border-[#E3E1DA] bg-white p-4">
      <figcaption className="text-center text-sm font-semibold text-[#16202E]">{title}</figcaption>
      {children}
      {note && <p className="text-center text-xs text-[#5B6472]">{note}</p>}
    </figure>
  );
}

function Empty() {
  return <p className="py-10 text-center text-sm text-[#5B6472]">Nothing in this date range.</p>;
}

// Horizontal bars, one per category (e.g. win rate by lead source).
export function HBarChart({
  title,
  data,
  format,
  colour = BLUE,
  note,
}: {
  title: string;
  data: { label: string; value: number; sub?: string }[];
  format: Format;
  colour?: string;
  note?: string;
}) {
  const max = niceMax(Math.max(...data.map((d) => d.value), 0), format);
  return (
    <ChartCard title={title} note={note}>
      {data.length === 0 ? (
        <Empty />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {data.map((d) => (
            <li key={d.label} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-sm">
              <span className="truncate text-[#16202E]" title={d.label}>
                {d.label}
              </span>
              <span className="h-5 w-full overflow-hidden rounded bg-[#ECEAE3]" aria-hidden>
                <span
                  className="block h-full rounded"
                  style={{ width: `${Math.max(0, Math.min(1, d.value / max)) * 100}%`, background: colour }}
                />
              </span>
              <span className="whitespace-nowrap text-right font-semibold text-[#16202E]">
                {fmtValue(d.value, format)}
                {d.sub && <span className="ml-1 text-xs font-normal text-[#5B6472]">{d.sub}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}

function Legend({ series }: { series: { name: string; colour: string }[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-[#5B6472]">
      {series.map((s) => (
        <span key={s.name} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.colour }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

type Series = { name: string; values: number[]; colour?: string };

// Shared frame for monthly charts: y axis with gridlines, month labels.
function MonthFrame({
  months,
  max,
  format,
  children,
}: {
  months: { key: string; label: string }[];
  max: number;
  format: Format;
  children: (x: (i: number) => number, y: (v: number) => number, slot: number) => React.ReactNode;
}) {
  const W = 640;
  const H = 220;
  const left = 48;
  const bottom = 24;
  const top = 8;
  const plotW = W - left - 8;
  const plotH = H - bottom - top;
  const slot = plotW / Math.max(months.length, 1);
  const x = (i: number) => left + slot * i + slot / 2;
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const every = Math.ceil(months.length / 12);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#ECEAE3" />
          <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#5B6472">
            {fmtAxis(t, format)}
          </text>
        </g>
      ))}
      {children(x, y, slot)}
      {months.map((m, i) =>
        i % every === 0 ? (
          <text key={m.key} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="#5B6472">
            {m.label}
          </text>
        ) : null
      )}
    </svg>
  );
}

// Bars by month, side by side per series (e.g. total sold by month).
export function ColumnChart({
  title,
  months,
  series,
  format,
  note,
}: {
  title: string;
  months: { key: string; label: string }[];
  series: Series[];
  format: Format;
  note?: string;
}) {
  const coloured = series.map((s, i) => ({ ...s, colour: s.colour ?? SERIES_COLOURS[i % SERIES_COLOURS.length] }));
  const max = niceMax(Math.max(0, ...coloured.flatMap((s) => s.values)), format);
  const empty = coloured.every((s) => s.values.every((v) => v === 0));
  return (
    <ChartCard title={title} note={note}>
      {empty ? (
        <Empty />
      ) : (
        <>
          <MonthFrame months={months} max={max} format={format}>
            {(x, y, slot) => {
              const barW = Math.max(2, Math.min(18, (slot * 0.7) / coloured.length));
              return coloured.map((s, si) =>
                s.values.map((v, i) =>
                  v > 0 ? (
                    <rect
                      key={`${s.name}-${i}`}
                      x={x(i) - (barW * coloured.length) / 2 + si * barW}
                      y={y(v)}
                      width={barW - 1}
                      height={Math.max(1, y(0) - y(v))}
                      rx={2}
                      fill={s.colour}
                    >
                      <title>{`${months[i].label} · ${s.name}: ${fmtValue(v, format)}`}</title>
                    </rect>
                  ) : null
                )
              );
            }}
          </MonthFrame>
          <Legend series={coloured} />
        </>
      )}
    </ChartCard>
  );
}

// Lines by month (e.g. cumulative total sold per salesperson).
export function LineChart({
  title,
  months,
  series,
  format,
  note,
}: {
  title: string;
  months: { key: string; label: string }[];
  series: Series[];
  format: Format;
  note?: string;
}) {
  const coloured = series.map((s, i) => ({ ...s, colour: s.colour ?? SERIES_COLOURS[i % SERIES_COLOURS.length] }));
  const max = niceMax(Math.max(0, ...coloured.flatMap((s) => s.values)), format);
  const empty = coloured.every((s) => s.values.every((v) => v === 0));
  return (
    <ChartCard title={title} note={note}>
      {empty ? (
        <Empty />
      ) : (
        <>
          <MonthFrame months={months} max={max} format={format}>
            {(x, y) =>
              coloured.map((s) => (
                <g key={s.name}>
                  <polyline
                    points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                    fill="none"
                    stroke={s.colour}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                  />
                  {s.values.map((v, i) => (
                    <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.colour}>
                      <title>{`${months[i].label} · ${s.name}: ${fmtValue(v, format)}`}</title>
                    </circle>
                  ))}
                </g>
              ))
            }
          </MonthFrame>
          <Legend series={coloured} />
        </>
      )}
    </ChartCard>
  );
}

// Share of a whole (e.g. how quotes were accepted).
export function DonutChart({
  title,
  data,
  format,
  note,
}: {
  title: string;
  data: { label: string; value: number; colour?: string }[];
  format: Format;
  note?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const size = 180;
  const stroke = 30;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const shown = data.filter((d) => d.value > 0);
  // Where each slice starts round the ring.
  const parts = shown.map((d, i) => ({
    ...d,
    colour: d.colour ?? SERIES_COLOURS[i % SERIES_COLOURS.length],
    len: total > 0 ? (d.value / total) * c : 0,
    start: total > 0 ? (shown.slice(0, i).reduce((s, x) => s + x.value, 0) / total) * c : 0,
  }));
  return (
    <ChartCard title={title} note={note}>
      {total === 0 ? (
        <Empty />
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-6">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ECEAE3" strokeWidth={stroke} />
            {parts.map((p) => (
                <circle
                  key={p.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={p.colour}
                  strokeWidth={stroke}
                  strokeDasharray={`${p.len} ${c - p.len}`}
                  strokeDashoffset={-p.start}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                >
                  <title>{`${p.label}: ${fmtValue(p.value, format)}`}</title>
                </circle>
            ))}
            <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize="16" fontWeight="700" fill="#16202E">
              {fmtValue(total, format)}
            </text>
          </svg>
          <ul className="flex flex-col gap-1.5 text-sm">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ background: p.colour }} />
                <span className="text-[#16202E]">{p.label}</span>
                <span className="font-semibold text-[#16202E]">{fmtValue(p.value, format)}</span>
                <span className="text-xs text-[#5B6472]">{Math.round((p.value / total) * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}
