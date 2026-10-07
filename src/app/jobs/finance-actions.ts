"use server";

// Variations and claims (customer invoices) on a job. Admin-only, like the
// tables' RLS.
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import type { VariationStatus } from "@/lib/jobs/jobFinance";

type Result = { error?: string };

export type VariationInput = {
  name: string;
  status: VariationStatus;
  amount: number;
  budgetCategoryId: string | null;
  budgetAmount: number;
  hours: number;
  notes: string;
};

const refresh = (jobId: string) => {
  revalidatePath(`/jobs/${jobId}`, "layout");
  revalidatePath("/jobs/live");
  revalidatePath("/jobs/forecast");
};

function cleanVariation(input: VariationInput) {
  return {
    name: input.name.trim(),
    status: input.status,
    amount: Number.isFinite(input.amount) ? Math.round(input.amount * 100) / 100 : 0,
    budget_category_id: input.budgetCategoryId || null,
    budget_amount: Number.isFinite(input.budgetAmount) ? Math.round(input.budgetAmount * 100) / 100 : 0,
    hours: Number.isFinite(input.hours) ? input.hours : 0,
    notes: input.notes.trim() || null,
  };
}

export async function createVariationAction(jobId: string, input: VariationInput): Promise<Result> {
  const supabase = await requireAdmin();
  if (!input.name.trim()) return { error: "Give the variation a name." };

  // V01, V02... per job.
  const { count } = await supabase.from("job_variations").select("id", { count: "exact", head: true }).eq("job_id", jobId);
  const { error } = await supabase.from("job_variations").insert({
    job_id: jobId,
    reference: `V${String((count ?? 0) + 1).padStart(2, "0")}`,
    ...cleanVariation(input),
    approved_at: input.status === "approved" ? new Date().toISOString() : null,
  });
  if (error) return { error: error.message };
  refresh(jobId);
  return {};
}

export async function updateVariationAction(jobId: string, variationId: string, input: VariationInput): Promise<Result> {
  const supabase = await requireAdmin();
  if (!input.name.trim()) return { error: "Give the variation a name." };

  const { data: before } = await supabase.from("job_variations").select("status, approved_at").eq("id", variationId).single();
  const { error } = await supabase
    .from("job_variations")
    .update({
      ...cleanVariation(input),
      approved_at:
        input.status === "approved" ? (before?.status === "approved" ? before.approved_at : new Date().toISOString()) : null,
    })
    .eq("id", variationId)
    .eq("job_id", jobId);
  if (error) return { error: error.message };
  refresh(jobId);
  return {};
}

export async function deleteVariationAction(jobId: string, variationId: string): Promise<Result> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("job_variations").delete().eq("id", variationId).eq("job_id", jobId);
  if (error) return { error: error.message };
  refresh(jobId);
  return {};
}

export type ClaimInput = { claimDate: string; reference: string; amount: number; notes: string };

export async function saveClaimAction(jobId: string, claimId: string | null, input: ClaimInput): Promise<Result> {
  const supabase = await requireAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.claimDate)) return { error: "Choose the date of the claim." };
  if (!Number.isFinite(input.amount) || input.amount === 0) return { error: "Enter the amount claimed." };

  const row = {
    claim_date: input.claimDate,
    reference: input.reference.trim() || null,
    amount: Math.round(input.amount * 100) / 100,
    notes: input.notes.trim() || null,
  };
  const { error } = claimId
    ? await supabase.from("job_claims").update(row).eq("id", claimId).eq("job_id", jobId)
    : await supabase.from("job_claims").insert({ job_id: jobId, ...row });
  if (error) return { error: error.message };
  refresh(jobId);
  return {};
}

export async function deleteClaimAction(jobId: string, claimId: string): Promise<Result> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("job_claims").delete().eq("id", claimId).eq("job_id", jobId);
  if (error) return { error: error.message };
  refresh(jobId);
  return {};
}
