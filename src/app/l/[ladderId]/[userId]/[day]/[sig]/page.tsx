// The ladder inspection form from a reminder email's "Inspect now" link -
// no sign-in: the link is signed for this person and ladder
// (lib/safety/ladderLinks.ts). A tick box per item: tick it if it's OK.
// Saving records the inspection in the ladder register. Opening the link
// changes nothing (email apps sometimes open links by themselves).
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyLadderLink } from "@/lib/safety/ladderLinks";
import { checksFor, describeLadder, fmtDay, latestInspections, nextDue, type Ladder, type LadderInspection } from "@/lib/safety/laddersShared";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { recordLadderInspectionAction } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  notes: "Not everything is ticked, so this ladder will FAIL and be tagged out. Say what's wrong below, tick to confirm, and save again - or tick the items that are OK.",
  gone: "This ladder isn't in the register any more, or your account isn't active. Talk to the office.",
  save: "That didn't save - please try again.",
};

export default async function LadderInspectPage({
  params,
  searchParams,
}: {
  params: Promise<{ ladderId: string; userId: string; day: string; sig: string }>;
  searchParams: Promise<{ done?: string; error?: string; f?: string }>;
}) {
  const { ladderId, userId, day, sig } = await params;
  const { done, error, f } = await searchParams;
  if (!(await verifyLadderLink(ladderId, userId, day, sig))) notFound();

  const db = createAdminClient();
  const [{ data: ladder }, { data: person }, { data: inspections }] = await Promise.all([
    db.from("ladders").select("*").eq("id", ladderId).maybeSingle<Ladder>(),
    db.from("profiles").select("full_name").eq("id", userId).maybeSingle<{ full_name: string }>(),
    db.from("ladder_inspections").select("*").eq("ladder_id", ladderId).returns<LadderInspection[]>(),
  ]);
  if (!ladder) notFound();
  const first = person?.full_name?.trim().split(/\s+/)[0] ?? "";
  const last = latestInspections(inspections ?? []).get(ladderId);
  const due = nextDue(ladder, last);
  const items = checksFor(ladder.ladder_type);
  // After a "not everything ticked" bounce, keep what they had ticked.
  const wasUnticked = new Set((f ?? "").split(",").filter(Boolean));

  return (
    <main className="min-h-screen bg-[#F5F4F0] px-4 py-6 text-[#16202E]">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <div>
          <p className="text-sm font-semibold text-[#5B6472]">Platinum Painters · Ladder inspection</p>
          <h1 className="text-2xl font-bold">Ladder {ladder.asset_no}</h1>
          <p className="text-sm text-[#5B6472]">
            {describeLadder(ladder)}
            {ladder.location ? ` · ${ladder.location}` : ""}
          </p>
          <p className="mt-1 text-sm text-[#5B6472]">
            {last ? `Last inspected ${fmtDay(last.inspected_on)} (${last.result === "fail" ? "failed" : "passed"})` : "Never inspected"}
            {due ? ` · due ${fmtDay(due)}` : ""}
          </p>
        </div>

        {done ? (
          <div className={`rounded-xl border p-5 ${done === "fail" ? "border-[#F5B5B5] bg-[#FDECEC]" : "border-[#B7E1C4] bg-[#EAF7EE]"}`}>
            <p className="text-xl font-bold">{done === "fail" ? "Recorded - ladder tagged out" : `Thanks${first ? `, ${first}` : ""} - all OK`}</p>
            <p className="mt-1 text-sm">
              {done === "fail"
                ? `Don't use ladder ${ladder.asset_no}. Put a "Do not use" tag on it - the supervisors have been told.`
                : `The inspection is in the ladder register for ${fmtDay(nzTodayDateString())}.`}
            </p>
          </div>
        ) : ladder.status === "retired" ? (
          <p className="rounded-xl border border-[#E3E1DA] bg-white p-5">This ladder has been retired - no inspection needed.</p>
        ) : (
          <form action={recordLadderInspectionAction} className="flex flex-col gap-4">
            <input type="hidden" name="ladderId" value={ladderId} />
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="day" value={day} />
            <input type="hidden" name="sig" value={sig} />

            {ladder.status === "tagged_out" && (
              <p className="rounded-lg border border-[#F5B5B5] bg-[#FDECEC] p-3 text-sm font-semibold text-[#B91C1C]">
                This ladder is tagged out. Record a check here, but only the office can put it back in service.
              </p>
            )}
            {error && ERRORS[error] && <p className="rounded-lg border border-[#F5B5B5] bg-[#FDECEC] p-3 text-sm font-semibold text-[#B91C1C]">{ERRORS[error]}</p>}

            <p className="text-sm">
              {first ? `${first}, check` : "Check"} each item and <b>tick it if it&apos;s OK</b>. Leave it unticked if it isn&apos;t - the ladder will fail and be tagged out.
            </p>
            <ul className="flex flex-col divide-y divide-[#EFEDE7] rounded-xl border border-[#E3E1DA] bg-white">
              {items.map((c) => (
                <li key={c.key}>
                  <label className="flex cursor-pointer items-start gap-3 p-4">
                    <input type="checkbox" name={`ok_${c.key}`} defaultChecked={Boolean(f) && !wasUnticked.has(c.key)} className="mt-0.5 h-7 w-7 flex-none accent-[#166534]" />
                    <span>
                      <span className="block font-semibold">{c.label} OK</span>
                      <span className="block text-sm text-[#5B6472]">{c.hint}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Notes - what&apos;s wrong, if anything</span>
              <textarea name="notes" rows={3} className="w-full rounded-lg border border-[#D9D6CC] bg-white px-3 py-2.5 text-base" />
            </label>
            {error === "notes" && (
              <label className="flex items-start gap-3 rounded-lg border border-[#F5B5B5] bg-white p-3 text-sm font-semibold text-[#B91C1C]">
                <input type="checkbox" name="confirmFail" className="mt-0.5 h-6 w-6 flex-none" />
                Yes - the unticked items are not OK. Fail this ladder and tag it out.
              </label>
            )}

            <button className="min-h-12 w-full rounded-lg bg-[#1F4E8C] px-4 text-base font-semibold text-white hover:bg-[#183E70]">Save inspection</button>
            <p className="text-center text-xs text-[#5B6472]">Inspected by {person?.full_name ?? "you"} · {fmtDay(nzTodayDateString())}</p>
          </form>
        )}
      </div>
    </main>
  );
}
