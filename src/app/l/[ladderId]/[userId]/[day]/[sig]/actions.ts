"use server";

// Saves an inspection from a reminder email's "Inspect now" link, as the
// person the link was sent to, straight into the ladder register. Each
// item is a tick box: ticked = OK, unticked = not OK (a fail, which tags
// the ladder out - database trigger - and tells the supervisors).
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyLadderLink } from "@/lib/safety/ladderLinks";
import { CHECKS, describeLadder, resultsFromTicks, type Ladder } from "@/lib/safety/laddersShared";
import { notificationRecipients } from "@/lib/notifications/recipients";
import { sendEmail } from "@/lib/email/mailer";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { SITE_URL } from "@/lib/timesheets/siteUrl";

export async function recordLadderInspectionAction(formData: FormData) {
  const ladderId = String(formData.get("ladderId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const day = String(formData.get("day") ?? "");
  const sig = String(formData.get("sig") ?? "");
  if (!(await verifyLadderLink(ladderId, userId, day, sig))) redirect("/sign-in");
  const back = `/l/${ladderId}/${userId}/${day}/${sig}`;

  const db = createAdminClient();
  const [{ data: ladder }, { data: person }] = await Promise.all([
    db.from("ladders").select("*").eq("id", ladderId).maybeSingle<Ladder>(),
    db.from("profiles").select("full_name, is_active, deleted_at").eq("id", userId).maybeSingle<{ full_name: string; is_active: boolean; deleted_at: string | null }>(),
  ]);
  if (!ladder || ladder.status === "retired" || !person?.is_active || person.deleted_at) redirect(`${back}?error=gone`);

  const checks = resultsFromTicks(ladder.ladder_type, (key) => formData.get(`ok_${key}`) === "on");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000);
  const result = Object.values(checks).includes("fail") ? "fail" : "pass";
  // Not everything ticked: they must say what's wrong (and confirm it).
  if (result === "fail" && (!notes || formData.get("confirmFail") !== "on")) {
    const unticked = CHECKS.filter((c) => checks[c.key] === "fail").map((c) => c.key).join(",");
    redirect(`${back}?error=notes&f=${unticked}`);
  }

  const { error } = await db.from("ladder_inspections").insert({
    ladder_id: ladderId,
    inspected_on: nzTodayDateString(),
    inspected_by: userId,
    result,
    checks,
    notes: notes || null,
  });
  if (error) redirect(`${back}?error=save`);

  if (result === "fail") {
    try {
      const to = await notificationRecipients("ladder_inspection");
      const failed = CHECKS.filter((c) => checks[c.key] === "fail").map((c) => c.label).join(", ");
      if (to.length)
        await sendEmail({
          to: to.join(", "),
          fromName: "The Hub",
          subject: `Ladder ${ladder.asset_no} failed inspection - tagged out`,
          text:
            `${person.full_name} inspected ladder ${ladder.asset_no} (${describeLadder(ladder)}) and it failed: ${failed}.\n\n` +
            `Notes: ${notes}\n\n` +
            `It's tagged out in the register until it's repaired and put back in service: ${SITE_URL}/safety/ladders\n`,
        });
    } catch (e) {
      console.error("[ladder fail email]", e);
    }
  }
  redirect(`${back}?done=${result}`);
}
