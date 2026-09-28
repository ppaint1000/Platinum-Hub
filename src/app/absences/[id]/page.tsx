import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { firstClockIn } from "@/lib/absences/data";
import type { AbsenceType } from "@/lib/absences/types";
import { ABSENCE_TYPES } from "@/lib/absences/types";
import { recordAbsenceAction, deleteAbsenceAction } from "@/app/absences/actions";
import { Card, DashboardShell, fmtDate } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export const metadata: Metadata = { title: "Record absence · Platinum Hub" };

const input =
  "min-h-11 w-full rounded-lg border border-[#D9D6CC] bg-white px-3 text-sm text-[#16202E] focus:border-[#1F4E8C] focus:outline-none";

// Where the "Record absence" button in the 9am email lands. Also used to
// change a record later.
export default async function RecordAbsencePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await requireAdmin();

  const { data: absence } = await supabase
    .from("absences")
    .select("id, user_id, absence_date, absence_type, reason, flagged_by_check")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      user_id: string;
      absence_date: string;
      absence_type: AbsenceType | null;
      reason: string | null;
      flagged_by_check: boolean;
    }>();
  if (!absence) redirect("/absences");

  const [{ data: person }, clockedInAt] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", absence.user_id).maybeSingle<{ full_name: string }>(),
    firstClockIn(supabase, absence.user_id, absence.absence_date),
  ]);
  const name = person?.full_name ?? "Unknown";
  const arrived = clockedInAt
    ? new Date(clockedInAt).toLocaleTimeString("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={ADMIN_NAV} activeHref="/absences" />}
      todayKey={nzTodayDateString()}
      title={absence.absence_type ? "Edit absence" : "Record absence"}
    >
      <Link href="/absences" className="-mt-3 self-start text-sm font-semibold text-[#1F4E8C] hover:underline md:-mt-5">
        ← All absences
      </Link>

      <Card className="flex max-w-xl flex-col gap-5 p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <p className="text-xl font-bold">{name}</p>
          <p className="text-sm text-[#5B6472]">
            {fmtDate(absence.absence_date)}
            {absence.flagged_by_check && " · hadn't clocked in by 9am"}
          </p>
          {arrived && (
            <p className="mt-1 self-start rounded-lg bg-[#E3ECF8] px-3 py-1.5 text-sm font-semibold text-[#163A69]">
              Clocked in later that day at {arrived}
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-[#B91C1C] px-4 py-3 text-sm font-semibold text-white">
            {error}
          </p>
        )}

        <form action={recordAbsenceAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={absence.id} />
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-semibold text-[#3F4753]">Why weren&apos;t they in?</legend>
            {ABSENCE_TYPES.map((t, i) => (
              <label key={t.value} className="flex min-h-11 items-center gap-3 rounded-lg border border-[#E3E1DA] px-3 text-[15px] has-[:checked]:border-[#16202E] has-[:checked]:bg-[#F5F4F0]">
                <input
                  type="radio"
                  name="type"
                  value={t.value}
                  required={i === 0}
                  defaultChecked={absence.absence_type === t.value}
                  className="h-4 w-4 accent-[#16202E]"
                />
                {t.label}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-semibold text-[#3F4753]">
            Reason
            <textarea
              name="reason"
              required
              rows={3}
              defaultValue={absence.reason ?? ""}
              placeholder="e.g. Called in with the flu"
              className={`${input} py-2`}
            />
          </label>
          <button
            type="submit"
            className="min-h-11 self-start rounded-lg bg-[#16202E] px-5 text-sm font-semibold text-white transition hover:bg-black"
          >
            Save
          </button>
        </form>

        {!absence.flagged_by_check && (
          <form action={deleteAbsenceAction} className="border-t border-[#EFEDE7] pt-4">
            <input type="hidden" name="id" value={absence.id} />
            <button type="submit" className="min-h-10 text-sm font-semibold text-[#B91C1C] hover:underline">
              Delete this record
            </button>
          </form>
        )}
      </Card>
    </DashboardShell>
  );
}
