"use client";

// The week on the Schedule: a row per person (and one for bookings with no
// crew yet), each booking a coloured bar across its days, who's away from
// Absences in grey, public holidays in the day heading. Click an empty day
// to book someone there, or a bar to change it.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import type { Booking, ScheduleData, ScheduleJob } from "@/lib/schedule/data";
import { deleteBookingAction, saveBookingAction } from "@/app/schedule/actions";
import { Card } from "@/components/dashboard/parts";

const NAME_COL = "11rem";
const COLS = { gridTemplateColumns: `${NAME_COL} repeat(7, minmax(0, 1fr))` };
const DAYS7 = { gridTemplateColumns: "repeat(7, minmax(0, 1fr))" };

// A colour per job, so the same job reads the same across everyone's rows.
const PALETTE = [
  "bg-[#1F4E8C] text-white",
  "bg-[#0F766E] text-white",
  "bg-[#9A3412] text-white",
  "bg-[#6D28D9] text-white",
  "bg-[#B45309] text-white",
  "bg-[#BE185D] text-white",
  "bg-[#15803D] text-white",
  "bg-[#334155] text-white",
];
function colourFor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const ABSENCE: Record<string, string> = {
  sick: "Sick",
  authorised_leave: "Leave",
  unauthorised_leave: "Away",
  not_rostered: "Not rostered",
};

const input = "w-full rounded-lg border border-[#E3E1DA] bg-white px-3 py-2 text-sm text-[#16202E]";

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const shortDay = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", timeZone: "UTC" });

function jobLabel(j: ScheduleJob | undefined) {
  if (!j) return "Job";
  return j.job_number ? `${j.job_number} · ${j.name}` : j.name;
}

type Draft = {
  id?: string;
  jobId: string;
  start: string;
  end: string;
  crew: string[];
  notes: string;
  emailCustomer: boolean;
  remindCustomer: boolean;
  emailedAt: string | null;
};

const blank = (start: string, crew: string[], jobId = ""): Draft => ({
  jobId,
  start,
  end: start,
  crew,
  notes: "",
  emailCustomer: false,
  remindCustomer: false,
  emailedAt: null,
});

export function ScheduleBoard({ data, today, bookJobId }: { data: ScheduleData; today: string; bookJobId: string | null }) {
  const router = useRouter();
  // ?book=<job id> (from "Book on the schedule" on Production) opens the form for that job.
  const [draft, setDraft] = useState<Draft | null>(() =>
    bookJobId && data.jobs.some((j) => j.id === bookJobId)
      ? blank(today < data.weekStart ? data.weekStart : today, [], bookJobId)
      : null
  );
  const [message, setMessage] = useState<string | null>(null);
  const jobsById = useMemo(() => new Map(data.jobs.map((j) => [j.id, j])), [data.jobs]);
  const weekEnd = addDays(data.weekStart, 6);

  const edit = (b: Booking) =>
    setDraft({
      id: b.id,
      jobId: b.job_id,
      start: b.start_date,
      end: b.end_date,
      crew: b.crew,
      notes: b.notes ?? "",
      emailCustomer: b.email_customer,
      remindCustomer: b.remind_customer,
      emailedAt: b.customer_emailed_at,
    });

  const rows = [
    { id: "", name: "No crew yet", bookings: data.bookings.filter((b) => b.crew.length === 0) },
    ...data.staff.map((s) => ({ id: s.id, name: s.full_name, bookings: data.bookings.filter((b) => b.crew.includes(s.id)) })),
  ];
  const toSchedule = data.jobs.filter((j) => j.status === "won");
  const prev = addDays(data.weekStart, -7);
  const next = addDays(data.weekStart, 7);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/schedule?week=${prev}`} aria-label="Previous week" className="rounded-lg border border-[#E3E1DA] bg-white p-2 hover:bg-[#F8FAFD]">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <Link href="/schedule" className="rounded-lg border border-[#E3E1DA] bg-white px-3 py-1.5 text-sm font-semibold hover:bg-[#F8FAFD]">
          This week
        </Link>
        <Link href={`/schedule?week=${next}`} aria-label="Next week" className="rounded-lg border border-[#E3E1DA] bg-white p-2 hover:bg-[#F8FAFD]">
          <ChevronRight className="h-4 w-4" />
        </Link>
        <p className="ml-1 text-base font-semibold">
          {shortDay(data.weekStart)} – {shortDay(weekEnd)} {weekEnd.slice(0, 4)}
        </p>
        <button
          type="button"
          onClick={() => setDraft(blank(today >= data.weekStart && today <= weekEnd ? today : data.weekStart, []))}
          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-[#1F4E8C] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#183E70]"
        >
          <Plus className="h-4 w-4" /> Book a job
        </button>
      </div>

      {message && (
        <p className="flex items-start justify-between gap-3 rounded-lg border border-[#F2C4C4] bg-[#FDECEC] px-4 py-2.5 text-sm text-[#7F1D1D]">
          {message}
          <button type="button" onClick={() => setMessage(null)} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </p>
      )}

      <Card className="overflow-x-auto">
        <div className="min-w-[56rem]">
          {/* Day headings */}
          <div className="grid border-b border-[#E3E1DA] bg-[#F8F7F3] text-sm" style={COLS}>
            <div className="px-3 py-2 font-semibold text-[#5B6472]">Crew</div>
            {data.days.map((d) => (
              <div
                key={d.key}
                className={`border-l border-[#E3E1DA] px-2 py-2 ${d.key === today ? "bg-[#E3ECF8]" : ""}`}
              >
                <p className={`font-semibold ${d.key === today ? "text-[#1F4E8C]" : ""}`}>
                  {new Date(`${d.key}T00:00:00Z`).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", timeZone: "UTC" })}
                </p>
                {d.holiday && <p className="truncate text-xs font-semibold text-[#B91C1C]">{d.holiday}</p>}
              </div>
            ))}
          </div>

          {rows.map((row) => (
            <div key={row.id || "none"} className="grid border-b border-[#EFEDE7] last:border-b-0" style={COLS}>
              <div className={`px-3 py-2.5 text-sm font-semibold ${row.id ? "" : "italic text-[#5B6472]"}`}>{row.name}</div>
              <div className="relative col-span-7 min-h-14">
                {/* Empty days: click to book this person there. */}
                <div className="absolute inset-0 grid" style={DAYS7}>
                  {data.days.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setDraft(blank(d.key, row.id ? [row.id] : []))}
                      aria-label={`Book ${row.id ? row.name : "a job"} on ${shortDay(d.key)}`}
                      className={`border-l border-[#EFEDE7] hover:bg-[#F3F7FC] ${
                        d.holiday || d.weekend ? "bg-[#F8F7F3]" : ""
                      } ${d.key === today ? "bg-[#F3F7FC]" : ""}`}
                    />
                  ))}
                </div>
                {/* Bookings and absences on top. */}
                <div className="pointer-events-none relative grid gap-1 p-1.5" style={{ ...DAYS7, gridAutoFlow: "row dense" }}>
                  {data.absences
                    .filter((a) => a.user_id === row.id)
                    .map((a) => {
                      const i = dayDiff(data.weekStart, a.absence_date);
                      return (
                        <div
                          key={`a-${a.absence_date}`}
                          style={{ gridColumn: `${i + 1} / ${i + 2}` }}
                          className="truncate rounded-md bg-[#ECEAE3] px-2 py-1 text-xs font-semibold text-[#5B6472]"
                        >
                          Away{a.absence_type ? ` · ${ABSENCE[a.absence_type] ?? ""}` : ""}
                        </div>
                      );
                    })}
                  {row.bookings.map((b) => {
                    const s = Math.max(0, dayDiff(data.weekStart, b.start_date));
                    const e = Math.min(6, dayDiff(data.weekStart, b.end_date));
                    const job = jobsById.get(b.job_id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => edit(b)}
                        style={{ gridColumn: `${s + 1} / ${e + 2}` }}
                        title={`${jobLabel(job)}${job?.client_name ? ` (${job.client_name})` : ""}\n${shortDay(b.start_date)} – ${shortDay(b.end_date)}${b.notes ? `\n${b.notes}` : ""}`}
                        className={`pointer-events-auto min-w-0 rounded-md px-2 py-1 text-left text-xs shadow-sm hover:brightness-110 ${colourFor(b.job_id)}`}
                      >
                        <span className="block truncate font-semibold">
                          {b.start_date < data.weekStart && "‹ "}
                          {jobLabel(job)}
                          {b.end_date > weekEnd && " ›"}
                        </span>
                        {job?.client_name && <span className="block truncate opacity-85">{job.client_name}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">To be scheduled</h2>
        {toSchedule.length === 0 ? (
          <p className="text-sm text-[#5B6472]">Every won job has been booked.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {toSchedule.map((j) => (
              <li key={j.id}>
                <button
                  type="button"
                  onClick={() => setDraft(blank(today >= data.weekStart && today <= weekEnd ? today : data.weekStart, [], j.id))}
                  className="flex items-center gap-2 rounded-lg border border-[#E3E1DA] bg-white px-3 py-2 text-sm hover:border-[#9DB6D9]"
                >
                  <span className="font-semibold">{jobLabel(j)}</span>
                  {j.client_name && <span className="text-[#5B6472]">{j.client_name}</span>}
                  <span className="rounded-full bg-[#E3ECF8] px-2 py-0.5 text-xs font-semibold text-[#163A69]">Book</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {draft && (
        <BookingForm
          draft={draft}
          data={data}
          onClose={() => setDraft(null)}
          onSaved={(note) => {
            setDraft(null);
            setMessage(note ?? null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function BookingForm({
  draft: initial,
  data,
  onClose,
  onSaved,
}: {
  draft: Draft;
  data: ScheduleData;
  onClose: () => void;
  onSaved: (note?: string) => void;
}) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const job = data.jobs.find((j) => j.id === d.jobId);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  // Won jobs first (still to book), then the ones under way.
  const order = ["won", "scheduled", "in_progress", "complete"];
  const jobs = [...data.jobs].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.name.localeCompare(b.name));
  const STATUS: Record<string, string> = {
    won: "To be scheduled",
    scheduled: "Scheduled",
    in_progress: "In progress",
    complete: "Completed",
  };

  function save() {
    setError(null);
    start(async () => {
      const r = await saveBookingAction({
        id: d.id,
        jobId: d.jobId,
        start: d.start,
        end: d.end,
        crew: d.crew,
        notes: d.notes,
        emailCustomer: d.emailCustomer,
        remindCustomer: d.remindCustomer,
      });
      if (r.error) setError(r.error);
      else onSaved(r.note);
    });
  }

  function remove() {
    if (!d.id || !confirm("Take this booking off the schedule?")) return;
    start(async () => {
      const r = await deleteBookingAction(d.id!);
      if (r.error) setError(r.error);
      else onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={d.id ? "Change booking" : "Book a job"}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{d.id ? "Change booking" : "Book a job"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 hover:bg-[#F5F4F0]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 text-sm">
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Job</span>
            <select className={input} value={d.jobId} onChange={(e) => set({ jobId: e.target.value })}>
              <option value="">Choose a job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {jobLabel(j)}
                  {j.client_name ? ` (${j.client_name})` : ""} - {STATUS[j.status] ?? j.status}
                </option>
              ))}
            </select>
            {job && (job.address || job.work_order_url) && (
              <span className="text-xs text-[#5B6472]">
                {job.address}
                {job.work_order_url && (
                  <>
                    {job.address ? " · " : ""}
                    <a href={job.work_order_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1F4E8C] underline">
                      Work order
                    </a>
                  </>
                )}
              </span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-semibold">Start</span>
              <input
                type="date"
                className={input}
                value={d.start}
                onChange={(e) => set({ start: e.target.value, end: d.end < e.target.value ? e.target.value : d.end })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-semibold">Finish</span>
              <input type="date" className={input} value={d.end} min={d.start} onChange={(e) => set({ end: e.target.value })} />
            </label>
          </div>

          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-semibold">Crew</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {data.staff.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-lg border border-[#E3E1DA] px-2.5 py-2">
                  <input
                    type="checkbox"
                    checked={d.crew.includes(s.id)}
                    onChange={(e) => set({ crew: e.target.checked ? [...d.crew, s.id] : d.crew.filter((x) => x !== s.id) })}
                  />
                  <span className="truncate">{s.full_name}</span>
                </label>
              ))}
            </div>
            {data.staff.length === 0 && <p className="text-[#5B6472]">No painters set up yet (Users and access).</p>}
          </fieldset>

          <label className="flex flex-col gap-1">
            <span className="font-semibold">Notes for the crew</span>
            <textarea className={input} rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. Scaffold up Tuesday, start on the north side" />
          </label>

          <fieldset className="flex flex-col gap-2 rounded-lg bg-[#F8F7F3] p-3">
            <legend className="sr-only">Customer emails</legend>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={d.emailCustomer} onChange={(e) => set({ emailCustomer: e.target.checked })} />
              <span>
                Email the customer the booked dates
                <span className="block text-xs text-[#5B6472]">
                  {d.emailedAt
                    ? "Already emailed - they'll get another email only if the dates change."
                    : "Goes to the email on their Clients page when you save."}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={d.remindCustomer} onChange={(e) => set({ remindCustomer: e.target.checked })} />
              <span>Remind the customer the day before we start</span>
            </label>
          </fieldset>

          {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}

          <div className="flex items-center gap-2">
            {d.id && (
              <button type="button" onClick={remove} disabled={pending} className="rounded-lg px-3 py-2 font-semibold text-[#B91C1C] hover:bg-[#FDECEC]">
                Remove
              </button>
            )}
            <button type="button" onClick={onClose} className="ml-auto rounded-lg border border-[#E3E1DA] px-4 py-2 font-semibold hover:bg-[#F5F4F0]">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-lg bg-[#1F4E8C] px-4 py-2 font-semibold text-white hover:bg-[#183E70] disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
