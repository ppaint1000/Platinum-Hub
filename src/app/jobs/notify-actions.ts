"use server";

import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { sendJobCompletedEmail } from "@/lib/notifications/jobCompleted";

// Called after a job page marks a job complete (the update itself is done
// in the browser). Checks the job really is at Job completed before
// emailing, so calling it twice or early does nothing.
export async function notifyJobCompletedAction(jobId: string) {
  await requireAppAccess("jobs");
  await sendJobCompletedEmail(jobId);
}
