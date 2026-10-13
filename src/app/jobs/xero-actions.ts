"use server";

// Xero customer invoices -> job claims. Admins only.
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkUnmatchedInvoice, syncXeroInvoices, type SyncResult } from "@/lib/xero/invoices";

async function admin() {
  const profile = await getCurrentProfile();
  if (profile.role !== "admin") throw new Error("Admins only.");
}

const refresh = () => {
  revalidatePath("/jobs", "layout");
  revalidatePath("/reports", "layout");
};

export async function checkXeroNowAction(): Promise<SyncResult> {
  await admin();
  const r = await syncXeroInvoices();
  refresh();
  return r;
}

export async function linkXeroInvoiceAction(xeroInvoiceId: string, jobId: string) {
  await admin();
  if (!jobId) return { error: "Choose the job." };
  await linkUnmatchedInvoice(xeroInvoiceId, jobId);
  refresh();
  return {};
}

export async function dismissXeroInvoiceAction(xeroInvoiceId: string) {
  await admin();
  await createAdminClient().from("xero_unmatched_invoices").update({ dismissed: true }).eq("xero_invoice_id", xeroInvoiceId);
  refresh();
  return {};
}
