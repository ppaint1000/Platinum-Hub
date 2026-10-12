"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { emailMonthlyReport } from "@/lib/reports/monthlyReport";

// "Send by email now" on the Monthly report page.
export async function sendMonthlyReportNowAction(formData: FormData) {
  await requireAdmin();
  const month = String(formData.get("month") ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) redirect("/reports/monthly");
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const sent = await emailMonthlyReport(month, origin);
  redirect(`/reports/monthly?month=${month}&sent=${sent ? "1" : "0"}`);
}
