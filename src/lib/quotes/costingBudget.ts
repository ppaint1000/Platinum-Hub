// A costing's COST (not sell) by job budget category - what a won job's
// Budget & costs starts from. Same sums as the costing's Summary tab cost
// column (options left out):
//   Labour   - painting hours (incl. prep and sheeting up) × labour cost rate,
//              plus hand-priced Wash and night shift / out of hours at cost
//   Paint    - litres × each paint's cost per litre
//   Scaffold / EWP / Other - the Access & Other items at cost, by description
//   Other    - plus the site and other allowances
import type { SupabaseClient } from "@supabase/supabase-js";

type Line = {
  line_type?: string | null;
  qty: number;
  hours: number;
  litres: number;
  prep_hours: number;
  paint_product_id: string | null;
  unit_price?: number | null;
};
type Building = {
  id: string;
  sheeting_up_enabled: boolean;
  sheeting_up_pct: number;
  night_shift_enabled: boolean | null;
  night_shift_rate: number | null;
  out_of_hours_enabled?: boolean | null;
  out_of_hours_rate?: number | null;
  is_option?: boolean | null;
  quote_building_lines: Line[] | null;
};
type Item = {
  building_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  markup_pct: number | null;
  line_total: number;
  scaffold_role: "edt" | "hire" | null;
  is_option?: boolean | null;
};

// job_categories keys.
export type BudgetKey = "labour" | "paint" | "access_scaffold" | "access_ewp" | "other";
export const BUDGET_LABELS: Record<BudgetKey, string> = {
  labour: "Labour",
  paint: "Paint",
  access_scaffold: "Scaffold",
  access_ewp: "EWP",
  other: "Other",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function itemKey(i: Item): BudgetKey {
  const text = i.description.toLowerCase();
  if (i.scaffold_role || /scaffold/.test(text)) return "access_scaffold";
  if (/\bewp\b|boom|scissor|cherry ?picker|knuckle|\blift\b/.test(text)) return "access_ewp";
  return "other";
}

export async function costingBudget(db: SupabaseClient, quoteId: string): Promise<Record<BudgetKey, number> | null> {
  const [{ data: quote }, { data: buildings }, { data: items }, { data: settings }, { data: paints }] = await Promise.all([
    db.from("quotes").select("labour_cost_override, allowance_site, allowance_other").eq("id", quoteId).maybeSingle(),
    db.from("quote_buildings").select("*, quote_building_lines(*)").eq("quote_id", quoteId),
    db.from("quote_line_items").select("*").eq("quote_id", quoteId),
    db.from("costing_settings").select("labour_rate_cost, markup_other_pct").limit(1).maybeSingle(),
    db.from("paint_products").select("id, cost_per_litre, is_default"),
  ]);
  if (!quote) return null;

  const labourRateCost = quote.labour_cost_override ?? settings?.labour_rate_cost ?? 30;
  const markupOtherPct = settings?.markup_other_pct ?? 0.2;
  const products = (paints ?? []) as { id: string; cost_per_litre: number; is_default: boolean }[];
  const defaultPaintId = products.find((p) => p.is_default)?.id ?? null;
  const costPerLitre = new Map(products.map((p) => [p.id, Number(p.cost_per_litre)]));

  const all = (buildings ?? []) as Building[];
  const optionAreas = new Set(all.filter((b) => b.is_option).map((b) => b.id));
  const out: Record<BudgetKey, number> = { labour: 0, paint: 0, access_scaffold: 0, access_ewp: 0, other: 0 };

  for (const b of all.filter((b) => !b.is_option)) {
    const lines = b.quote_building_lines ?? [];
    const rawHours = lines.reduce((s, l) => s + l.hours, 0);
    const prepHours = lines.reduce((s, l) => s + l.prep_hours, 0);
    const pricedWash = lines.filter((l) => l.line_type === "wash" && l.unit_price != null);
    const washHours = pricedWash.reduce((s, l) => s + l.hours, 0);
    const washCost = pricedWash.reduce((s, l) => s + l.qty * (l.unit_price ?? 0), 0);
    const hourlyHours = lines.filter((l) => l.line_type === "hourly").reduce((s, l) => s + l.hours, 0);
    const sheetingUpHours = b.sheeting_up_enabled ? b.sheeting_up_pct * (rawHours - washHours - hourlyHours) : 0;
    const totalHours = rawHours + prepHours + sheetingUpHours;
    const nightOn = !!b.night_shift_enabled;
    const oohOn = !nightOn && !!b.out_of_hours_enabled;
    const shiftRate = nightOn ? (b.night_shift_rate ?? 0) : oohOn ? (b.out_of_hours_rate ?? 0) : 0;
    const shiftCost = nightOn || oohOn ? totalHours * shiftRate : 0;

    out.labour += (totalHours - washHours) * labourRateCost + washCost + shiftCost;
    for (const l of lines) {
      const id = l.paint_product_id ?? defaultPaintId;
      if (id && l.litres > 0) out.paint += l.litres * (costPerLitre.get(id) ?? 0);
    }
  }

  for (const i of (items ?? []) as Item[]) {
    if (i.is_option || (i.building_id !== null && optionAreas.has(i.building_id))) continue;
    const cost = i.markup_pct !== null ? i.unit_price * i.quantity : i.line_total / (1 + markupOtherPct);
    out[itemKey(i)] += cost;
  }
  out.other += Number(quote.allowance_site ?? 0) + Number(quote.allowance_other ?? 0);

  for (const k of Object.keys(out) as BudgetKey[]) out[k] = round2(out[k]);
  return out;
}

// Puts the costing's figures on the job's budget: each category the costing
// has a cost for is replaced; categories added by hand are left alone.
// onlyIfEmpty: skip a job that already has any budget (the automatic fill).
export async function fillBudgetFromCosting(
  db: SupabaseClient,
  jobId: string,
  opts: { onlyIfEmpty?: boolean } = {}
): Promise<{ filled: boolean; error?: string }> {
  const { data: job } = await db.from("jobs").select("source_quote_id").eq("id", jobId).maybeSingle<{ source_quote_id: string | null }>();
  if (!job?.source_quote_id) return { filled: false, error: "This job wasn't priced in Costing." };
  if (opts.onlyIfEmpty) {
    const { count } = await db.from("job_budget_lines").select("id", { count: "exact", head: true }).eq("job_id", jobId);
    if ((count ?? 0) > 0) return { filled: false };
  }
  const budget = await costingBudget(db, job.source_quote_id);
  if (!budget) return { filled: false, error: "Couldn't find the costing." };

  const keys = (Object.keys(budget) as BudgetKey[]).filter((k) => budget[k] > 0);
  if (!keys.length) return { filled: false, error: "The costing has no costs yet." };
  const { data: cats, error: catError } = await db.from("job_categories").select("id, key").in("key", keys);
  if (catError) return { filled: false, error: catError.message };
  const idByKey = new Map((cats ?? []).map((c) => [c.key as string, c.id as string]));

  const rows = keys.filter((k) => idByKey.has(k)).map((k) => ({ job_id: jobId, category_id: idByKey.get(k)!, budgeted_amount: budget[k] }));
  const { error: delError } = await db.from("job_budget_lines").delete().eq("job_id", jobId).in("category_id", rows.map((r) => r.category_id));
  if (delError) return { filled: false, error: delError.message };
  const { error } = await db.from("job_budget_lines").insert(rows);
  if (error) return { filled: false, error: error.message };
  return { filled: true };
}

// Won (or further on) jobs priced in Costing that have no budget yet.
export async function fillMissingBudgets(db: SupabaseClient) {
  const { data: jobs } = await db
    .from("jobs")
    .select("id, job_budget_lines(id)")
    .not("source_quote_id", "is", null)
    .in("status", ["won", "scheduled", "in_progress"]);
  let filled = 0;
  for (const j of (jobs ?? []) as { id: string; job_budget_lines: { id: string }[] }[]) {
    if (j.job_budget_lines?.length) continue;
    if ((await fillBudgetFromCosting(db, j.id, { onlyIfEmpty: true })).filled) filled++;
  }
  return filled;
}
