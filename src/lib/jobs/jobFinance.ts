// A job's money picture, shared by the job pages, Live jobs and the
// Forecast: the contract value (quote plus approved variations), what has
// been claimed (invoiced to the customer), and the budget with approved
// variations added on.
import type { SupabaseClient } from "@supabase/supabase-js";

export type VariationStatus = "pending" | "approved" | "declined";

export type Variation = {
  id: string;
  job_id: string;
  reference: string | null;
  name: string;
  status: VariationStatus;
  amount: number;
  budget_category_id: string | null;
  budget_amount: number;
  hours: number;
  notes: string | null;
  approved_at: string | null;
  created_at: string;
};

export type Claim = {
  id: string;
  job_id: string;
  claim_date: string;
  reference: string | null;
  amount: number;
  notes: string | null;
};

// Jobs that are won and not yet paid - what's "live".
export const LIVE_STATUSES = ["won", "scheduled", "in_progress", "complete", "invoiced"] as const;

export async function fetchVariations(supabase: SupabaseClient, jobIds: string[]): Promise<Variation[]> {
  if (jobIds.length === 0) return [];
  const { data } = await supabase
    .from("job_variations")
    .select("id, job_id, reference, name, status, amount, budget_category_id, budget_amount, hours, notes, approved_at, created_at")
    .in("job_id", jobIds)
    .order("created_at");
  return (data ?? []).map((v) => ({
    ...v,
    amount: Number(v.amount),
    budget_amount: Number(v.budget_amount),
    hours: Number(v.hours),
  })) as Variation[];
}

export async function fetchClaims(supabase: SupabaseClient, jobIds: string[]): Promise<Claim[]> {
  if (jobIds.length === 0) return [];
  const { data } = await supabase
    .from("job_claims")
    .select("id, job_id, claim_date, reference, amount, notes")
    .in("job_id", jobIds)
    .order("claim_date");
  return (data ?? []).map((c) => ({ ...c, amount: Number(c.amount) })) as Claim[];
}

export function variationTotals(variations: Variation[]) {
  const approved = variations.filter((v) => v.status === "approved");
  const budgetByCategory = new Map<string, number>();
  for (const v of approved) {
    if (v.budget_category_id && v.budget_amount) {
      budgetByCategory.set(v.budget_category_id, (budgetByCategory.get(v.budget_category_id) ?? 0) + v.budget_amount);
    }
  }
  return {
    approvedAmount: approved.reduce((s, v) => s + v.amount, 0),
    pendingAmount: variations.filter((v) => v.status === "pending").reduce((s, v) => s + v.amount, 0),
    approvedHours: approved.reduce((s, v) => s + v.hours, 0),
    // Approved variation cost budget with no category still counts in the total.
    approvedBudget: approved.reduce((s, v) => s + v.budget_amount, 0),
    budgetByCategory,
    pendingCount: variations.filter((v) => v.status === "pending").length,
    approvedCount: approved.length,
  };
}

export const groupBy = <T, K>(items: T[], key: (t: T) => K) => {
  const map = new Map<K, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
};

export function money(n: number, cents = false) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: cents ? 2 : 0,
    minimumFractionDigits: cents ? 2 : 0,
  }).format(n);
}

// "Labour", "Materials" etc. - how Live jobs groups the budget categories.
export function categoryGroup(key: string): "labour" | "materials" | "access" | "other" {
  if (key === "labour") return "labour";
  if (key === "paint" || key === "sundries") return "materials";
  if (key.startsWith("access")) return "access";
  return "other";
}
