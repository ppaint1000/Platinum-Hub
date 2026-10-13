"use server";

// Xero bills page. Admins only.
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkUnmatchedBill, setSupplierSetting } from "@/lib/xero/bills";

async function admin() {
  const p = await getCurrentProfile();
  if (p.role !== "admin") throw new Error("Admins only.");
}

const refresh = () => revalidatePath("/jobs", "layout");

// Pick the job (null = overheads, not a job). With `rememberOrder`, the
// bill's reference is saved as one of the job's order numbers so the
// supplier's next bill with it matches by itself.
export async function linkBillAction(xeroBillId: string, jobId: string | null, rememberOrder: string | null) {
  await admin();
  await linkUnmatchedBill(xeroBillId, jobId);
  if (jobId && rememberOrder?.trim()) {
    await createAdminClient()
      .from("job_order_numbers")
      .upsert({ order_number: rememberOrder.trim(), job_id: jobId }, { onConflict: "order_number", ignoreDuplicates: true });
  }
  refresh();
  return {};
}

export async function setSupplierAction(contactName: string, categoryId: string | null, excluded: boolean) {
  await admin();
  await setSupplierSetting(contactName, categoryId || null, excluded);
  refresh();
  return {};
}
