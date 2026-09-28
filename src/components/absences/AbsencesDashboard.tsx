import Link from "next/link";
import {
  BLUE,
  QUOTED_FILL,
  RED,
  Card,
  Empty,
  Headline,
  Pill,
  SectionHeading,
  fmtDate,
} from "@/components/dashboard/parts";
import { RANGE_LABEL, type AbsenceRange, type AbsencesData } from "@/lib/absences/data";
import { ABSENCE_LABEL, ABSENCE_TYPES, type AbsenceType } from "@/lib/absences/types";
import { addAbsenceAction, addClosedDaysAction, removeClosedDayAction } from "@/app/absences/actions";

// Colours per absence type. Unauthorised is the warning red.
const TYPE_COLOUR: Record<"sick" | "authorised_leave" | "unauthorised_leave", string> = {
  sick: BLUE,
  authorised_leave: QUOTED_FILL,
  unauthorised_leave: RED,
};
const STACK = ["unauthorised_leave", "sick", "authorised_leave"] as const;

const input =
  "min-h-11 w-full rounded-lg border border-[#D9D6CC] bg-white px-3 text-sm text-[#16202E] focus:border-[#1F4E8C] focus:outline-none";
const label = "flex flex-col gap-1 text-sm font-semibold text-[#3F4753]";
const button =
  "min-h-11 rounded-lg bg-[#16202E] px-4 text-sm font-semibold text-white transition hover:bg-black";

function days(n: number) {
  return `${n} day${n === 1 ? "" : "s"}`;
}

export function TypePill({ type }: { type: AbsenceType | null }) {
  if (!type) return <Pill level="alert">Needs a reason</Pill>;
  if (type === "unauthorised_leave") return <Pill level="alert">{ABSENCE_LABEL[type]}</Pill>;
  if (type === "sick") return <Pill level="soon">{ABSENCE_LABEL[type]}</Pill>;
  return <Pill level="ok">{ABSENCE_LABEL[type]}</Pill>;
}

export function AbsencesDashboard({ data, error, saved }: { data: AbsencesData; error?: string; saved?: boolean }) {
  return (
    <>
      {error && (
        <p role="alert" className="rounded-lg bg-[#B91C1C] px-4 py-3 text-sm font-semibold text-white">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="rounded-lg bg-[#E3ECF8] px-4 py-3 text-sm font-semibold text-[#163A69]">Saved.</p>
      )}

      <PendingSection data={data} />

      <RangeTabs range={data.range} />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">
        <Headline label="Days absent" value={String(data.totals.total)}>
          {RANGE_LABEL[data.range]}
        </Headline>
        <Headline label="Off sick" value={String(data.totals.sick)}>
          {days(data.totals.authorised_leave)} authorised leave
        </Headline>
        <Headline label="Unauthorised" value={String(data.totals.unauthorised_leave)}>
          {data.totals.unauthorised_leave > 0 ? <Pill level="alert">Follow up</Pill> : "None"}
        </Headline>
        <Headline label="Most common day" value={data.commonDay ?? "—"}>
          {data.commonDay ? "For sick and leave days" : "No absences yet"}
        </Headline>
      </section>

      <div className="grid gap-6 md:gap-8 lg:grid-cols-2">
        <WeekdayChart data={data} />
        <MonthChart data={data} />
      </div>

      <PeopleSection data={data} />
      <RecentSection data={data} />

      <div className="grid gap-6 md:gap-8 lg:grid-cols-2">
        <AddAbsence data={data} />
        <ClosedDays data={data} />
      </div>
    </>
  );
}

function RangeTabs({ range }: { range: AbsenceRange }) {
  return (
    <nav aria-label="Period" className="flex flex-wrap gap-2">
      {(Object.keys(RANGE_LABEL) as AbsenceRange[]).map((r) => (
        <Link
          key={r}
          href={r === "12m" ? "/absences" : `/absences?range=${r}`}
          aria-current={r === range ? "page" : undefined}
          className={`flex min-h-10 items-center rounded-full border px-4 text-sm font-semibold transition ${
            r === range
              ? "border-[#16202E] bg-[#16202E] text-white"
              : "border-[#D9D6CC] bg-white text-[#3F4753] hover:border-[#1F4E8C] hover:text-[#1F4E8C]"
          }`}
        >
          {RANGE_LABEL[r]}
        </Link>
      ))}
    </nav>
  );
}

function PendingSection({ data }: { data: AbsencesData }) {
  if (data.pending.length === 0) return null;
  return (
    <section aria-label="Needs a reason" className="flex flex-col gap-3">
      <SectionHeading title="Needs a reason" count={data.pending.length} />
      <Card>
        <ul className="flex flex-col divide-y divide-[#EFEDE7]">
          {data.pending.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <span className="text-[15px] font-semibold">{a.name}</span>
                <span className="text-[13px] text-[#5B6472]">Not clocked in by 9am · {fmtDate(a.date)}</span>
              </div>
              <Link
                href={`/absences/${a.id}`}
                className="flex min-h-11 shrink-0 items-center rounded-lg bg-[#B91C1C] px-4 text-sm font-semibold text-white hover:bg-[#991B1B]"
              >
                Record reason
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[#5B6472]" aria-hidden>
      {(["sick", "authorised_leave", "unauthorised_leave"] as const).map((t) => (
        <span key={t} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ background: TYPE_COLOUR[t] }} />
          {ABSENCE_LABEL[t]}
        </span>
      ))}
    </div>
  );
}

type Stack = { key: string; label: string; sick: number; authorised_leave: number; unauthorised_leave: number; total: number };

function StackedBars({ bars, height, caption }: { bars: Stack[]; height: number; caption: string }) {
  const max = Math.max(...bars.map((b) => b.total), 1);
  return (
    <>
      <div aria-hidden className="grid border-b border-[#D9D6CC]" style={{ height, gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
        {bars.map((b) => (
          <div key={b.key} className="flex flex-col items-center justify-end" title={`${b.label}: ${b.total}`}>
            {b.total > 0 && <span className="mb-1 text-xs font-semibold">{b.total}</span>}
            <div className="flex w-5 flex-col-reverse overflow-hidden rounded-t sm:w-7">
              {STACK.map((t) =>
                b[t] > 0 ? <div key={t} style={{ height: (b[t] / max) * (height - 22), background: TYPE_COLOUR[t] }} /> : null
              )}
            </div>
          </div>
        ))}
      </div>
      <div aria-hidden className="grid text-center text-xs font-semibold" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
        {bars.map((b) => (
          <span key={b.key} className="pt-1.5">
            {b.label}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col"></th>
            {ABSENCE_TYPES.filter((t) => t.value !== "not_rostered").map((t) => (
              <th key={t.value} scope="col">
                {t.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <th scope="row">{b.label}</th>
              <td>{b.sick}</td>
              <td>{b.authorised_leave}</td>
              <td>{b.unauthorised_leave}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function WeekdayChart({ data }: { data: AbsencesData }) {
  return (
    <section aria-label="Absences by day of the week">
      <Card className="flex h-full flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="By day of the week" />
        <Legend />
        <StackedBars
          height={180}
          caption="Absences by day of the week"
          bars={data.byWeekday.map((d) => ({ ...d, key: d.day, label: d.day.slice(0, 3) }))}
        />
      </Card>
    </section>
  );
}

function MonthChart({ data }: { data: AbsencesData }) {
  return (
    <section aria-label="Absences by month">
      <Card className="flex h-full flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="By month" />
        <Legend />
        <div className="overflow-x-auto">
          <div className="min-w-[420px]">
            <StackedBars height={180} caption="Absences by month" bars={data.byMonth} />
          </div>
        </div>
      </Card>
    </section>
  );
}

function PeopleSection({ data }: { data: AbsencesData }) {
  const th = "px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-[#5B6472]";
  const thNum = th.replace("text-left", "text-right");
  const td = "px-3 py-3 text-right";
  return (
    <section aria-label="By person" className="flex flex-col gap-3">
      <SectionHeading title="By person" />
      {data.byPerson.length === 0 ? (
        <Card>
          <Empty>No sick or leave days recorded in this period.</Empty>
        </Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead className="border-b border-[#E3E1DA]">
              <tr>
                <th className={th}>Name</th>
                <th className={thNum}>Sick</th>
                <th className={thNum}>Authorised</th>
                <th className={thNum}>Unauthorised</th>
                <th className={thNum}>Total</th>
                <th className={th}>Most common day</th>
              </tr>
            </thead>
            <tbody>
              {data.byPerson.map((p) => (
                <tr key={p.id} className="border-b border-[#EFEDE7] last:border-0">
                  <td className="px-3 py-3 font-semibold">{p.name}</td>
                  <td className={td}>{p.sick}</td>
                  <td className={td}>{p.authorised_leave}</td>
                  <td className={td}>
                    {p.unauthorised_leave > 0 ? <Pill level="alert">{p.unauthorised_leave}</Pill> : 0}
                  </td>
                  <td className={`${td} font-bold`}>{p.total}</td>
                  <td className="px-3 py-3">{p.commonDay ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

function RecentSection({ data }: { data: AbsencesData }) {
  return (
    <section aria-label="Recent records" className="flex flex-col gap-3">
      <SectionHeading title="Recent records" />
      {data.recent.length === 0 ? (
        <Card>
          <Empty>Nothing recorded in this period yet.</Empty>
        </Card>
      ) : (
        <Card>
          <ul className="flex flex-col divide-y divide-[#EFEDE7]">
            {data.recent.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">
                    {a.name} · {fmtDate(a.date)}
                  </span>
                  {a.reason && <span className="text-[13px] text-[#5B6472]">{a.reason}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <TypePill type={a.type} />
                  <Link href={`/absences/${a.id}`} className="py-2 text-sm font-semibold text-[#1F4E8C] hover:underline">
                    Edit
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

export function TypeRadios() {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1 text-sm font-semibold text-[#3F4753]">Type</legend>
      {ABSENCE_TYPES.map((t, i) => (
        <label key={t.value} className="flex min-h-10 items-center gap-2.5 text-sm">
          <input type="radio" name="type" value={t.value} required={i === 0} className="h-4 w-4 accent-[#16202E]" />
          {t.label}
        </label>
      ))}
    </fieldset>
  );
}


function AddAbsence({ data }: { data: AbsencesData }) {
  return (
    <section aria-label="Record an absence">
      <Card className="flex h-full flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Record an absence" />
        <p className="text-sm text-[#5B6472]">
          For booked leave or a day the 9am check didn&apos;t catch. Anyone recorded here won&apos;t trigger a 9am
          email for those days.
        </p>
        <form action={addAbsenceAction} className="flex flex-col gap-3">
          <label className={label}>
            Who
            <select name="user_id" required className={input} defaultValue="">
              <option value="" disabled>
                Choose a person…
              </option>
              {data.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              From
              <input type="date" name="from" required className={input} defaultValue={data.todayKey} />
            </label>
            <label className={label}>
              To (optional)
              <input type="date" name="to" className={input} />
            </label>
          </div>
          <TypeRadios />
          <label className={label}>
            Reason
            <textarea name="reason" required rows={2} className={`${input} py-2`} />
          </label>
          <button type="submit" className={`${button} self-start`}>
            Save absence
          </button>
        </form>
      </Card>
    </section>
  );
}

function ClosedDays({ data }: { data: AbsencesData }) {
  return (
    <section aria-label="Closed days and public holidays">
      <Card className="flex h-full flex-col gap-4 p-4 md:p-5">
        <SectionHeading title="Closed days" />
        <p className="text-sm text-[#5B6472]">
          No 9am check runs on public holidays (including Auckland Anniversary) or on days you add here, like the
          Christmas shutdown.
        </p>
        <form action={addClosedDaysAction} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              From
              <input type="date" name="from" required className={input} />
            </label>
            <label className={label}>
              To (optional)
              <input type="date" name="to" className={input} />
            </label>
          </div>
          <label className={label}>
            Note
            <input type="text" name="note" placeholder="e.g. Christmas shutdown" className={input} />
          </label>
          <button type="submit" className={`${button} self-start`}>
            Add closed days
          </button>
        </form>

        {data.closedDays.length > 0 && (
          <ul className="flex flex-col divide-y divide-[#EFEDE7] border-t border-[#EFEDE7]">
            {data.closedDays.map((d) => (
              <li key={d.day} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm">
                  <span className="font-semibold">{fmtDate(d.day)}</span>
                  {d.note && <span className="text-[#5B6472]"> · {d.note}</span>}
                </span>
                <form action={removeClosedDayAction}>
                  <input type="hidden" name="day" value={d.day} />
                  <button type="submit" className="min-h-10 px-2 text-sm font-semibold text-[#B91C1C] hover:underline">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto border-t border-[#EFEDE7] pt-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[#5B6472]">Next public holidays</p>
          <ul className="flex flex-col gap-1 text-sm">
            {data.upcomingHolidays.map((h) => (
              <li key={h.date} className="flex justify-between gap-3">
                <span>{h.name}</span>
                <span className="text-[#5B6472]">{fmtDate(h.date)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </section>
  );
}
