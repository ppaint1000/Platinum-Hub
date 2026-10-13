"use server";

// Xero customer invoices -> job claims. Admins only.
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkUnmatchedInvoice, syncXeroInvoices, type SyncResult } from "@/lib/xero/invoices";
import { syncXeroBills, type BillSyncResult } from "@/lib/xero/bills";

async function admin() {
  const profile = await getCurrentProfile();
  if (profile.role !== "admin") throw new Error("Admins only.");
}

const refresh = () => {
  revalidatePath("/jobs", "layout");
  revalidatePath("/reports", "layout");
};

// Customer invoices and supplier bills, both.
export async function checkXeroNowAction(): Promise<SyncResult & { bills?: BillSyncResult }> {
  await admin();
  const r = await syncXeroInvoices();
  const bills = r.error ? undefined : await syncXeroBills();
  refresh();
  return { ...r, error: r.error ?? bills?.error, bills };
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
