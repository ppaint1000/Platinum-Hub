"use server";

// Order numbers from the paper order book, each against the job it was for,
// so the supplier's bill in Xero lands on that job. Admins and anyone with
// "Log an order" ticked.
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

import { canLogOrders } from "./access";

async function allowed() {
  if (!(await canLogOrders()).ok) throw new Error("You don't have Log an order - ask the office to tick it for you.");
}

export async function addOrderNumberAction(orderNumber: string, jobId: string) {
  await allowed();
  const n = orderNumber.trim();
  if (!n) return { error: "Enter the order number." };
  if (!jobId) return { error: "Choose the job." };
  const db = createAdminClient();
  const { data: existing } = await db.from("job_order_numbers").select("job_id, jobs(job_number, name)").eq("order_number", n).maybeSingle();
  if (existing) {
    const j = (Array.isArray(existing.jobs) ? existing.jobs[0] : existing.jobs) as { job_number: string | null; name: string } | null;
    return { error: `Order ${n} is already logged against ${j?.job_number ?? ""} ${j?.name ?? "another job"}.` };
  }
  const { error } = await db.from("job_order_numbers").insert({ order_number: n, job_id: jobId });
  if (error) return { error: error.message };
  revalidatePath("/jobs/order-numbers");
  revalidatePath(`/jobs/${jobId}`, "layout");
  return {};
}

export async function removeOrderNumberAction(id: string) {
  await allowed();
  await createAdminClient().from("job_order_numbers").delete().eq("id", id);
  revalidatePath("/jobs/order-numbers");
  revalidatePath("/jobs", "layout");
  return {};
}
