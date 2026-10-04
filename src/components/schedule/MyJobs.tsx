// A painter's own bookings from the Schedule for the next week, on the
// Clock in page: where they're going, who with, and the work order.
import { createClient } from "@/lib/supabase/server";
import { addDays, nzTodayDateString } from "@/lib/timesheets/formatNZ";

type MyBooking = {
  id: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  job_name: string;
  job_number: string | null;
  client_name: string | null;
  address: string | null;
  work_order_url: string | null;
  crew_names: string[];
};

const day = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export async function MyJobs({ myName }: { myName: string }) {
  const today = nzTodayDateString();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_bookings", { p_from: today, p_to: addDays(today, 7) });
  // Before the Schedule's database script is run, or nothing booked: nothing shown.
  if (error || !data?.length) return null;
  const bookings = data as MyBooking[];
  const tomorrow = addDays(today, 1);

  function when(b: MyBooking) {
    if (b.start_date <= today) return b.end_date === today ? "Today" : `Today - until ${day(b.end_date)}`;
    if (b.start_date === tomorrow) return b.end_date === tomorrow ? "Tomorrow" : `From tomorrow - until ${day(b.end_date)}`;
    return b.start_date === b.end_date ? day(b.start_date) : `${day(b.start_date)} - ${day(b.end_date)}`;
  }

  return (
    <section className="w-full max-w-md rounded-xl border border-black/10 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-base font-semibold">Your jobs this week</h2>
      <ul className="flex flex-col divide-y divide-black/5">
        {bookings.map((b) => {
          const others = b.crew_names.filter((n) => n !== myName);
          return (
            <li key={b.id} className="py-2.5 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1F4E8C]">{when(b)}</p>
              <p className="font-semibold">
                {b.job_number ? `${b.job_number} · ` : ""}
                {b.job_name}
              </p>
              {(b.address || b.client_name) && <p className="text-black/60">{b.address || b.client_name}</p>}
              {others.length > 0 && <p className="text-black/60">With {others.join(", ")}</p>}
              {b.notes && <p className="mt-1 whitespace-pre-wrap">{b.notes}</p>}
              <div className="mt-1.5 flex gap-3">
                {b.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-[#1F4E8C] underline"
                  >
                    Directions
                  </a>
                )}
                {b.work_order_url && (
                  <a href={b.work_order_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1F4E8C] underline">
                    Work order
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
