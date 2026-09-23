"use server";

import { revalidatePath } from "next/cache";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { requireAdmin } from "@/lib/auth/requireAdmin";

// Lets someone add a job straight into the pipeline without it coming
// through a Measures quote — e.g. a job assessed on-site and priced by
// hand. Starts life as "quoted" (skipping "draft") since by the time
// someone's filling this in, they've already assessed it and are ready to
// treat it as a live quote; source_quote_id stays null, which is fine —
// job_number is only ever assigned when a job is marked won, regardless of
// where it came from.
export async function createJobAction(input: {
  name: string;
  description: string;
  clientId: string;
  quotedSellTotal: number | null;
  quotedHours: number | null;
  leadByUserId: string;
}) {
  const supabase = await requireAppAccess("jobs");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!input.name.trim()) return { error: "Job name is required." };
  if (!input.description.trim()) return { error: "Description is required." };
  if (!input.clientId) return { error: "Choose a client." };
  // Quoted $ on the Sales page is credited by lead_by_user_id, so a quoted
  // job needs a sales person on it to show up there at all.
  if (!input.leadByUserId) return { error: "Choose which sales person quoted this job." };

  const { data, error } = await supabase
    .from("jobs")
    .insert({
      name: input.name.trim(),
      description: input.description.trim(),
      client_id: input.clientId,
      status: "quoted",
      quoted_sell_total: input.quotedSellTotal,
      quoted_hours: input.quotedHours,
      lead_by_user_id: input.leadByUserId,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/jobs");
  return { jobId: data.id as string };
}

export async function updateJobCoreDetailsAction(
  jobId: string,
  input: {
    name: string;
    description: string;
    clientId: string | null;
    quotedSellTotal: number | null;
    quotedHours: number | null;
    leadByUserId: string | null;
  }
) {
  const supabase = await requireAppAccess("jobs");

  if (!input.name.trim()) return { error: "Job name is required." };

  const { error } = await supabase
    .from("jobs")
    .update({
      name: input.name.trim(),
      description: input.description.trim() || null,
      client_id: input.clientId,
      quoted_sell_total: input.quotedSellTotal,
      quoted_hours: input.quotedHours,
      lead_by_user_id: input.leadByUserId,
    })
    .eq("id", jobId);

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  return {};
}

function slugify(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function addJobCategoryAction(jobId: string, label: string) {
  const supabase = await requireAppAccess("jobs");

  const trimmed = label.trim();
  if (!trimmed) return { error: "Category name is required." };

  const key = slugify(trimmed);
  if (!key) return { error: "Category name must include letters or numbers." };

  const { data: existing } = await supabase
    .from("job_categories")
    .select("id")
    .eq("key", key)
    .maybeSingle();
  if (existing) return { error: "A category with that name already exists." };

  const { data: maxRow } = await supabase
    .from("job_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("job_categories")
    .insert({ key, label: trimmed, sort_order: nextSortOrder });

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return {};
}

export async function renameJobCategoryAction(jobId: string, categoryId: string, label: string) {
  const supabase = await requireAppAccess("jobs");

  const trimmed = label.trim();
  if (!trimmed) return { error: "Category name is required." };

  const { error } = await supabase
    .from("job_categories")
    .update({ label: trimmed })
    .eq("id", categoryId);

  if (error) return { error: error.message };

  revalidatePath(`/jobs/${jobId}`);
  return {};
}

// Removes a job entered by mistake, at any status. Its budget and cost
// lines go with it (cascade), and orders / client contacts just lose their
// link. Supplier invoices and timesheet sites are different: an invoice
// assigned to the job has no cascade, and a linked site is where the
// job's labour hours come from, so either one blocks the delete with a
// pointer to unlink it first rather than silently dropping that history.
export async function deleteJobAction(jobId: string) {
  const supabase = await requireAdmin();

  const [{ data: invoices, error: invoiceError }, { data: splitLines, error: splitError }, { count: siteCount, error: siteError }] =
    await Promise.all([
      supabase
        .from("supplier_invoices")
        .select("invoice_number")
        .eq("job_id", jobId)
        .returns<{ invoice_number: string | null }[]>(),
      // A split invoice has no job_id of its own - some of its individual
      // lines can still point at this job even though the invoice row
      // wouldn't show up in the query above.
      supabase
        .from("supplier_invoice_lines")
        .select("invoice:supplier_invoices(invoice_number)")
        .eq("job_id", jobId)
        .returns<{ invoice: { invoice_number: string | null } | null }[]>(),
      supabase.from("sites").select("id", { count: "exact", head: true }).eq("job_id", jobId),
    ]);
  if (invoiceError) return { error: invoiceError.message };
  if (splitError) return { error: splitError.message };
  if (siteError) return { error: siteError.message };

  const numbers = new Set([
    ...(invoices ?? []).map((i) => i.invoice_number ?? "no number"),
    ...(splitLines ?? []).map((l) => l.invoice?.invoice_number ?? "no number"),
  ]);
  if (numbers.size > 0) {
    const invoiceCount = numbers.size;
    return {
      error: `${invoiceCount} supplier invoice${invoiceCount === 1 ? " is" : "s are"} assigned to this job (${[...numbers].join(", ")}) — move, unlink or re-split ${invoiceCount === 1 ? "it" : "them"} on the Supplier invoices page first.`,
    };
  }
  if ((siteCount ?? 0) > 0) {
    return {
      error: `${siteCount} timesheet site${siteCount === 1 ? " is" : "s are"} linked to this job — unlink ${siteCount === 1 ? "it" : "them"} on the site page first.`,
    };
  }

  // .select() so a delete that matched nothing (e.g. blocked by RLS) is
  // reported instead of looking like success.
  const { data: deleted, error } = await supabase
    .from("jobs")
    .delete()
    .eq("id", jobId)
    .select("id");

  if (error) return { error: error.message };
  if (!deleted || deleted.length === 0) return { error: "Job could not be deleted." };

  revalidatePath("/jobs");
  revalidatePath("/sales");
  return {};
}
