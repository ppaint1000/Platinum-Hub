import Link from "next/link";
import {
  FOLLOW_UP_DAYS,
  type SalesActivity,
  type SalesDashboardData,
  type SalesPersonSummary,
  type SalesQuote,
} from "@/lib/sales/dashboard";
import {
  BLUE,
  QUOTED_FILL,
  Card,
  DashboardShell,
  Empty,
  Headline,
  Pill,
  SectionHeading,
  WinRings,
  fmtDate,
  money,
  moneyK,
} from "@/components/dashboard/parts";
import { TopBar, type NavItem } from "@/components/dashboard/TopBar";

const wholePct = (n: number) => `${Math.round(n * 100)}%`;

function ofBudget(actual: number, budget: number, what: string) {
  if (budget <= 0) return "No budget set";
  return `${wholePct(actual / budget)} of ${money(budget)} ${what}`;
}

export function SalesDashboard({
  data,
  fontClass,
  nav,
  activeHref,
  title,
  canOpenJobs,
  tabs,
  overall = false,
}: {
  data: SalesDashboardData;
  fontClass: string;
  nav: NavItem[];
  activeHref: string;
  title: string;
  canOpenJobs: boolean;
  tabs?: React.ReactNode;
  // The whole team added together: adds the "By salesperson" table and
  // shows whose each quote and win is.
  overall?: boolean;
}) {
  const { thisMonth, yearToDate, monthLabel } = data;
  return (
    <DashboardShell
      fontClass={fontClass}
      topBar={<TopBar items={nav} activeHref={activeHref} />}
      todayKey={data.todayKey}
      title={title}
    >
      {tabs}

      <section aria-label="Key figures" className="grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">
        <Headline label={`Won · ${monthLabel}`} value={money(thisMonth.won)}>
          {ofBudget(thisMonth.won, thisMonth.budgetWon, "budget")}
        </Headline>
        <Headline label={`Quoted · ${monthLabel}`} value={money(thisMonth.quoted)}>
          {ofBudget(thisMonth.quoted, thisMonth.budgetQuoted, "budget")}
        </Headline>
        <Headline label={`Won · year to date`} value={money(yearToDate.won)}>
          {ofBudget(yearToDate.won, yearToDate.budgetWon, "budget so far")}
        </Headline>
        <WinRings
          title="Year to date"
          winRate={yearToDate.countWinRate}
          winSub={`${yearToDate.wonCount} won · ${yearToDate.lostCount} lost`}
          dollarsWon={yearToDate.winRate}
          dollarsSub={yearToDate.quoted > 0 ? `of ${money(yearToDate.quoted)} quoted` : "No quotes yet"}
        />
      </section>

      {overall && <PeopleSection people={data.people} monthLabel={monthLabel} />}

      <MonthlyChart data={data} />

      <div className="grid gap-6 md:gap-8 lg:grid-cols-2">
        <AwaitingSection data={data} canOpenJobs={canOpenJobs} showPerson={overall} />
        <WinsSection wins={data.recentWins} canOpenJobs={canOpenJobs} showPerson={overall} />
      </div>

      <ActivitySection activity={data.activity} canOpenJobs={canOpenJobs} showPerson={overall} />
    </DashboardShell>
  );
}

// ── Monthly chart: quoted vs won, with the sales budget marked ─────────

function MonthlyChart({ data }: { data: SalesDashboardData }) {
  const { months } = data;
  const currentKey = data.todayKey.slice(0, 7);
  const max = Math.max(...months.map((m) => Math.max(m.quoted, m.won, m.budgetWon)), 1);
  const chartHeight = 180;

  return (
    <section aria-label="Quoted and won by month">
      <Card className="flex flex-col gap-4 p-4 md:p-5">
        <SectionHeading title={`Quoted vs won · ${data.yearLabel}`} />

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[#5B6472]" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: QUOTED_FILL }} />
            Quoted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ background: BLUE }} />
            Won
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-[#16202E]" />
            Sales budget
          </span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div aria-hidden className="grid grid-cols-12 border-b border-[#D9D6CC]" style={{ height: chartHeight }}>
              {months.map((m) => {
                const future = m.key > currentKey;
                return (
                  <div
                    key={m.key}
                    className={`relative flex items-end justify-center gap-0.5 ${future ? "opacity-40" : ""} ${
                      m.key === currentKey ? "bg-[#F5F4F0]" : ""
                    }`}
                    title={`${m.label}: quoted ${money(m.quoted)}, won ${money(m.won)}, budget ${money(m.budgetWon)}`}
                  >
                    {[
                      [m.quoted, QUOTED_FILL],
                      [m.won, BLUE],
                    ].map(([v, fill], i) => (
                      <div
                        key={i}
                        className="w-3 rounded-t sm:w-4"
                        style={{
                          height: Math.max(((v as number) / max) * chartHeight, (v as number) > 0 ? 2 : 0),
                          background: fill as string,
                        }}
                      />
                    ))}
                    {m.budgetWon > 0 && (
                      <div
                        className="absolute inset-x-1.5 h-0.5 bg-[#16202E]"
                        style={{ bottom: (m.budgetWon / max) * chartHeight }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Same 12 columns as the bars above, so each label sits under its month. */}
            <div aria-hidden className="grid grid-cols-12 text-center text-xs">
              {months.map((m) => (
                <div
                  key={m.key}
                  className={`flex flex-col pt-1.5 ${m.key === currentKey ? "rounded-b bg-[#F5F4F0]" : ""}`}
                >
                  <span className="font-semibold">{m.label}</span>
                  {m.key <= currentKey && (
                    <>
                      <span className="text-[#5B6472]">{moneyK(m.quoted)}</span>
                      <span className="font-semibold">{moneyK(m.won)}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <table className="sr-only">
          <caption>Quoted, won and sales budget by month, {data.yearLabel}</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Quoted</th>
              <th scope="col">Won</th>
              <th scope="col">Sales budget</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.key}>
                <th scope="row">{m.label}</th>
                <td>{money(m.quoted)}</td>
                <td>{money(m.won)}</td>
                <td>{money(m.budgetWon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

// ── Quotes awaiting reply and recent wins ──────────────────────────────

function QuoteName({ quote, canOpenJobs }: { quote: SalesQuote; canOpenJobs: boolean }) {
  if (!canOpenJobs) return <span className="text-[15px] font-semibold">{quote.name}</span>;
  return (
    <Link href={`/jobs/${quote.id}`} className="text-[15px] font-semibold text-[#1F4E8C] hover:underline">
      {quote.name}
    </Link>
  );
}

// Whether the customer has opened the online proposal, with a link to it.
function ProposalStatus({ proposal }: { proposal: NonNullable<SalesQuote["proposal"]> }) {
  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-NZ", { day: "numeric", month: "short", timeZone: "Pacific/Auckland" });
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-[13px]">
      {proposal.viewCount > 0 ? (
        <span className="font-semibold text-[#1F4E8C]">
          Opened {proposal.viewCount}×{proposal.viewedAt ? ` · last ${shortDate(proposal.viewedAt)}` : ""}
        </span>
      ) : (
        <span className="text-[#5B6472]">
          {proposal.sentAt ? `Sent ${shortDate(proposal.sentAt)} · not opened yet` : "Proposal not sent yet"}
        </span>
      )}
      <a href={proposal.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1F4E8C] hover:underline">
        View proposal
      </a>
    </span>
  );
}

// Client, and on the Overall view whose quote it is.
function Who({ quote, showPerson }: { quote: SalesQuote; showPerson: boolean }) {
  const parts = [quote.client, showPerson ? quote.person : null].filter(Boolean);
  if (parts.length === 0) return null;
  return <span className="text-[13px] text-[#5B6472]">{parts.join(" · ")}</span>;
}

function daysAgo(days: number) {
  if (days <= 0) return "today";
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function AwaitingSection({
  data,
  canOpenJobs,
  showPerson,
}: {
  data: SalesDashboardData;
  canOpenJobs: boolean;
  showPerson: boolean;
}) {
  const followUps = data.awaiting.filter((q) => q.days >= FOLLOW_UP_DAYS).length;
  return (
    <section aria-label="Quotes awaiting reply">
      <Card className="flex h-full flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Awaiting reply" count={followUps} />
        {data.awaiting.length === 0 ? (
          <Empty>No quotes waiting on a reply.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-[#EFEDE7]">
            {data.awaiting.map((q) => (
              <li key={q.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <QuoteName quote={q} canOpenJobs={canOpenJobs} />
                  <Who quote={q} showPerson={showPerson} />
                  <span className="text-[13px] text-[#5B6472]">
                    Quoted {fmtDate(q.date)} · {daysAgo(q.days)}
                  </span>
                  {q.proposal && <ProposalStatus proposal={q.proposal} />}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-[15px] font-bold">{money(q.value)}</span>
                  {q.days >= FOLLOW_UP_DAYS && <Pill level="alert">Follow up</Pill>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex justify-between gap-3 border-t border-[#EFEDE7] pt-3 text-sm">
          <span className="text-[#5B6472]">
            {data.awaiting.length} quote{data.awaiting.length === 1 ? "" : "s"} waiting
          </span>
          <span className="font-bold">{money(data.awaitingValue)}</span>
        </div>
      </Card>
    </section>
  );
}

function WinsSection({
  wins,
  canOpenJobs,
  showPerson,
}: {
  wins: SalesQuote[];
  canOpenJobs: boolean;
  showPerson: boolean;
}) {
  return (
    <section aria-label="Recent wins">
      <Card className="flex h-full flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Recent wins" />
        {wins.length === 0 ? (
          <Empty>No won jobs yet.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-[#EFEDE7]">
            {wins.map((w) => (
              <li key={w.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <QuoteName quote={w} canOpenJobs={canOpenJobs} />
                  <Who quote={w} showPerson={showPerson} />
                  <span className="text-[13px] text-[#5B6472]">Won {fmtDate(w.date)}</span>
                </div>
                <span className="shrink-0 text-[15px] font-bold">{money(w.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

// ── Activity: the latest things that happened on quotes ────────────────

const ACTIVITY_LABEL: Record<SalesActivity["kind"], { text: string; color: string }> = {
  quoted: { text: "Quoted", color: "#5B6472" },
  sent: { text: "Proposal sent", color: "#5B6472" },
  opened: { text: "Proposal opened", color: "#1F4E8C" },
  accepted: { text: "Accepted online", color: "#1B7F4B" },
  won: { text: "Won", color: "#1B7F4B" },
  lost: { text: "Lost", color: "#B42318" },
};

function ActivitySection({
  activity,
  canOpenJobs,
  showPerson,
}: {
  activity: SalesActivity[];
  canOpenJobs: boolean;
  showPerson: boolean;
}) {
  return (
    <section aria-label="Activity">
      <Card className="flex flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Activity" />
        {activity.length === 0 ? (
          <Empty>Nothing yet - quotes, proposals, wins and losses will show here.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-[#EFEDE7]">
            {activity.map((a) => {
              const label = ACTIVITY_LABEL[a.kind];
              const who = [a.client, showPerson ? a.person : null].filter(Boolean).join(" · ");
              return (
                <li key={a.key} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[13px] font-bold uppercase tracking-wide" style={{ color: label.color }}>
                      {label.text}
                      {a.kind === "opened" && a.viewCount ? ` · ${a.viewCount}×` : ""}
                    </span>
                    {canOpenJobs ? (
                      <Link href={`/jobs/${a.jobId}`} className="text-[15px] font-semibold text-[#1F4E8C] hover:underline">
                        {a.name}
                      </Link>
                    ) : (
                      <span className="text-[15px] font-semibold">{a.name}</span>
                    )}
                    {who && <span className="text-[13px] text-[#5B6472]">{who}</span>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-[15px] font-bold">{money(a.value)}</span>
                    <span className="text-[13px] text-[#5B6472]">{daysAgo(a.days)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}

// ── Overall view: how each salesperson is tracking ─────────────────────

function PercentOf({ actual, budget }: { actual: number; budget: number }) {
  if (budget <= 0) return <span className="text-[#5B6472]">No budget</span>;
  const share = actual / budget;
  return share < 1 ? <Pill level="alert">{wholePct(share)}</Pill> : <span className="font-semibold">{wholePct(share)}</span>;
}

const winRate = (p: SalesPersonSummary) => (p.ytdQuoted > 0 ? wholePct(p.ytdWon / p.ytdQuoted) : "—");

function PeopleSection({ people, monthLabel }: { people: SalesPersonSummary[]; monthLabel: string }) {
  const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[#5B6472]";
  const thNum = th.replace("text-left", "text-right");
  const td = "px-3 py-3 text-right";
  const dt = "text-[11px] font-semibold uppercase tracking-wide text-[#5B6472]";
  return (
    <section aria-label="By salesperson" className="flex flex-col gap-3">
      <SectionHeading title="By salesperson" />
      {people.length === 0 ? (
        <Card>
          <Empty>No sales people set up yet. Tick Sales for someone on the Users page.</Empty>
        </Card>
      ) : (
        <>
          {/* Wide screens: one row per person */}
          <Card className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-[#E3E1DA]">
                <tr>
                  <th className={th}>Salesperson</th>
                  <th className={thNum}>Won · {monthLabel}</th>
                  <th className={thNum}>Of budget</th>
                  <th className={thNum}>Won · year to date</th>
                  <th className={thNum}>Of budget</th>
                  <th className={thNum}>Win rate</th>
                  <th className={thNum}>Awaiting reply</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-b border-[#EFEDE7] last:border-0">
                    <td className="px-3 py-3 font-semibold">
                      <Link href={"/sales/dashboard/" + p.id} className="text-[#1F4E8C] hover:underline">
                        {p.name}
                      </Link>
                    </td>
                    <td className={td}>{money(p.monthWon)}</td>
                    <td className={td}>
                      <PercentOf actual={p.monthWon} budget={p.monthBudgetWon} />
                    </td>
                    <td className={td}>{money(p.ytdWon)}</td>
                    <td className={td}>
                      <PercentOf actual={p.ytdWon} budget={p.ytdBudgetWon} />
                    </td>
                    <td className={td}>{winRate(p)}</td>
                    <td className={td}>
                      {p.awaitingCount} · {money(p.awaitingValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Phone and tablet: one card per person */}
          <ul className="grid gap-2.5 md:grid-cols-2 lg:hidden">
            {people.map((p) => (
              <li key={p.id}>
                <Card className="flex flex-col gap-3 p-3.5">
                  <Link href={"/sales/dashboard/" + p.id} className="text-[15px] font-bold text-[#1F4E8C] hover:underline">
                    {p.name}
                  </Link>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div className="flex flex-col items-start gap-0.5">
                      <dt className={dt}>Won · {monthLabel}</dt>
                      <dd className="flex flex-wrap items-center gap-1.5">
                        {money(p.monthWon)} <PercentOf actual={p.monthWon} budget={p.monthBudgetWon} />
                      </dd>
                    </div>
                    <div className="flex flex-col items-start gap-0.5">
                      <dt className={dt}>Won · year to date</dt>
                      <dd className="flex flex-wrap items-center gap-1.5">
                        {money(p.ytdWon)} <PercentOf actual={p.ytdWon} budget={p.ytdBudgetWon} />
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className={dt}>Win rate</dt>
                      <dd>{winRate(p)}</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className={dt}>Awaiting reply</dt>
                      <dd>
                        {p.awaitingCount} · {money(p.awaitingValue)}
                      </dd>
                    </div>
                  </dl>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
