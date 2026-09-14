// Win-rate report — won vs quoted per client, scoped to the current
// month/quarter/year. Same access gate as the rest of Clients/Jobs.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Panel, LedgerTable, SummaryStat } from "@/components/ui";

type Period = "month" | "quarter" | "year";

type JobRow = {
  client_id: string | null;
  status: "draft" | "quoted" | "won" | "in_progress" | "complete" | "lost";
  quoted_sell_total: number | null;
  quoted_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  client: { name: string } | null;
};

function periodStart(period: Period): Date {
  const now = new Date();
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "quarter") return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return new Date(now.getFullYear(), 0, 1);
}

function money(n: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function ClientsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period: Period =
    periodParam === "month" || periodParam === "quarter" || periodParam === "year"
      ? periodParam
      : "year";

  const supabase = await requireAppAccess("jobs");
  const start = periodStart(period);

  const { data: jobs } = await supabase
    .from("jobs")
    .select("client_id, status, quoted_sell_total, quoted_at, won_at, lost_at, client:clients(name)")
    .not("client_id", "is", null)
    .returns<JobRow[]>();

  const rows = (jobs ?? []).filter((j) => {
    const anchor = j.won_at ?? j.lost_at ?? j.quoted_at;
    return anchor != null && new Date(anchor) >= start;
  });

  type ClientStats = {
    name: string;
    quotedCount: number;
    quotedValue: number;
    wonCount: number;
    wonValue: number;
    lostCount: number;
    lostValue: number;
  };

  const byClient = new Map<string, ClientStats>();
  for (const j of rows) {
    if (!j.client_id) continue;
    const stats = byClient.get(j.client_id) ?? {
      name: j.client?.name ?? "Unknown client",
      quotedCount: 0,
      quotedValue: 0,
      wonCount: 0,
      wonValue: 0,
      lostCount: 0,
      lostValue: 0,
    };
    const value = j.quoted_sell_total ?? 0;
    stats.quotedCount += 1;
    stats.quotedValue += value;
    if (j.status === "won" || j.status === "in_progress" || j.status === "complete") {
      stats.wonCount += 1;
      stats.wonValue += value;
    } else if (j.status === "lost") {
      stats.lostCount += 1;
      stats.lostValue += value;
    }
    byClient.set(j.client_id, stats);
  }

  const clientRows = [...byClient.values()].sort((a, b) => b.quotedValue - a.quotedValue);

  const totals = clientRows.reduce(
    (acc, r) => ({
      quotedValue: acc.quotedValue + r.quotedValue,
      wonValue: acc.wonValue + r.wonValue,
      lostValue: acc.lostValue + r.lostValue,
      wonCount: acc.wonCount + r.wonCount,
      lostCount: acc.lostCount + r.lostCount,
    }),
    { quotedValue: 0, wonValue: 0, lostValue: 0, wonCount: 0, lostCount: 0 }
  );
  const overallWinRate =
    totals.wonCount + totals.lostCount > 0
      ? totals.wonCount / (totals.wonCount + totals.lostCount)
      : null;

  return (
    <div className="mx-auto w-full max-w-5xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/clients"
          className="flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Clients
        </Link>
        <div className="flex gap-1">
          {(["month", "quarter", "year"] as Period[]).map((p) => (
            <Link
              key={p}
              href={`/clients/report?period=${p}`}
              className={`rounded px-3 py-1 text-sm font-medium capitalize ${
                p === period
                  ? "bg-accent text-white"
                  : "text-ink-soft hover:bg-paper-sunken"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      </div>

      <h1 className="mb-6 text-3xl font-bold text-ink">Win rate</h1>

      <div className="mb-8 flex border-b border-line pb-6">
        <SummaryStat label="Quoted" value={money(totals.quotedValue)} />
        <SummaryStat label="Won" value={money(totals.wonValue)} />
        <SummaryStat label="Lost" value={money(totals.lostValue)} />
        <SummaryStat
          label="Win rate"
          value={overallWinRate != null ? `${(overallWinRate * 100).toFixed(0)}%` : "—"}
        />
      </div>

      {clientRows.length === 0 ? (
        <Panel className="p-6 text-center text-ink-soft">
          No decided quotes in this period yet.
        </Panel>
      ) : (
        <Panel className="p-4">
          <LedgerTable headers={["Client", "Quoted", "Won", "Lost", "Win rate"]}>
            {clientRows.map((r) => {
              const winRate =
                r.wonCount + r.lostCount > 0 ? r.wonCount / (r.wonCount + r.lostCount) : null;
              return (
                <tr key={r.name}>
                  <td className="py-2 text-ink">{r.name}</td>
                  <td className="py-2 pl-4 text-right tabular-nums text-ink-soft">
                    {money(r.quotedValue)} ({r.quotedCount})
                  </td>
                  <td className="py-2 pl-4 text-right tabular-nums text-ink-soft">
                    {money(r.wonValue)} ({r.wonCount})
                  </td>
                  <td className="py-2 pl-4 text-right tabular-nums text-ink-soft">
                    {money(r.lostValue)} ({r.lostCount})
                  </td>
                  <td className="py-2 pl-4 text-right tabular-nums text-ink">
                    {winRate != null ? `${(winRate * 100).toFixed(0)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </LedgerTable>
        </Panel>
      )}
    </div>
  );
}
