"use server";

// Health & safety → Ladders: the register and inspections. Who can do what
// is checked by the database (supabase/safety_ladders.sql) - managers do
// everything; anyone else with Health & safety can record an inspection.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sendLadderReminderNow } from "@/lib/safety/ladders";
import { CHECKS, LADDER_TYPES, MATERIALS, STATUSES, type CheckResult, type LadderMaterial, type LadderStatus, type LadderType } from "@/lib/safety/laddersShared";

type Result = { error?: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const done = () => {
  revalidatePath("/safety/ladders");
  revalidatePath("/safety");
  return {};
};

export type LadderInput = {
  id?: string;
  assetNo: string;
  ladderType: LadderType;
  material: LadderMaterial;
  // The size, in metres or steps (sizeUnit).
  lengthM: string;
  sizeUnit: "m" | "steps";
  ratingKg: string;
  standard: string;
  brand: string;
  location: string;
  // The person it's kept with, or "".
  assignedTo: string;
  inServiceOn: string;
  inspectEveryDays: string;
  status: LadderStatus;
  notes: string;
};

export async function saveLadderAction(l: LadderInput): Promise<Result> {
  const assetNo = l.assetNo.trim();
  if (!assetNo) return { error: "Give the ladder its tag number." };
  if (!LADDER_TYPES.some((t) => t.value === l.ladderType)) return { error: "Pick the type of ladder." };
  if (!MATERIALS.some((m) => m.value === l.material)) return { error: "Pick what it's made of." };
  if (!STATUSES.some((s) => s.value === l.status)) return { error: "Pick its status." };
  const size = l.lengthM.trim() ? Number(l.lengthM) : null;
  const inSteps = l.sizeUnit === "steps";
  if (size !== null && inSteps && !(Number.isInteger(size) && size > 0 && size < 100)) return { error: "Put the number of steps as a whole number." };
  if (size !== null && !inSteps && !(size > 0 && size < 100)) return { error: "That length isn't right." };
  const length = inSteps ? null : size;
  const steps = inSteps ? size : null;
  const rating = l.ratingKg.trim() ? Math.round(Number(l.ratingKg)) : null;
  if (rating !== null && !(rating > 0)) return { error: "That rating isn't right." };
  const every = Math.round(Number(l.inspectEveryDays));
  if (!(every > 0 && every <= 730)) return { error: "Inspect every ... days should be between 1 and 730." };
  if (l.inServiceOn && !DAY.test(l.inServiceOn)) return { error: "That date isn't right." };

  const row = {
    asset_no: assetNo,
    ladder_type: l.ladderType,
    material: l.material,
    length_m: length,
    steps,
    rating_kg: rating,
    standard: l.standard.trim() || null,
    brand: l.brand.trim() || null,
    location: l.location.trim() || null,
    assigned_to: l.assignedTo || null,
    in_service_on: l.inServiceOn || null,
    inspect_every_days: every,
    status: l.status,
    notes: l.notes.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const { error } = l.id ? await supabase.from("ladders").update(row).eq("id", l.id) : await supabase.from("ladders").insert(row);
  if (error) return { error: error.code === "23505" ? "There's already a ladder with that tag number." : error.message };
  return done();
}

export async function setLadderStatusAction(id: string, status: LadderStatus): Promise<Result> {
  if (!STATUSES.some((s) => s.value === status)) return { error: "Pick its status." };
  const supabase = await createClient();
  const { error } = await supabase.from("ladders").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  return done();
}

// Removes the ladder from the register, with its inspection history -
// admins only. (Retiring instead keeps the history.)
export async function deleteLadderAction(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("current_profile_role");
  if (role !== "admin") return { error: "Only an admin can remove a ladder." };
  const { error } = await supabase.from("ladders").delete().eq("id", id);
  if (error) return { error: error.message };
  return done();
}

export type InspectionInput = {
  id?: string;
  ladderId: string;
  inspectedOn: string;
  checks: Record<string, CheckResult>;
  notes: string;
};

export async function saveInspectionAction(i: InspectionInput): Promise<Result> {
  if (!i.ladderId) return { error: "Pick the ladder." };
  if (!DAY.test(i.inspectedOn)) return { error: "Put in the date it was checked." };
  const checks: Record<string, CheckResult> = {};
  for (const c of CHECKS) {
    const v = i.checks[c.key];
    if (v !== "pass" && v !== "fail" && v !== "na") return { error: `Mark "${c.label}" as pass, fail or n/a.` };
    checks[c.key] = v;
  }
  const result = Object.values(checks).includes("fail") ? "fail" : "pass";
  if (result === "fail" && !i.notes.trim()) return { error: "Say what's wrong with it in the notes." };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: "Please sign in again." };

  const row = { ladder_id: i.ladderId, inspected_on: i.inspectedOn, result, checks, notes: i.notes.trim() || null };
  const { error } = i.id
    ? await supabase.from("ladder_inspections").update(row).eq("id", i.id)
    : await supabase.from("ladder_inspections").insert({ ...row, inspected_by: auth.user.id });
  if (error) return { error: error.message };
  return done();
}

export async function deleteInspectionAction(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("ladder_inspections").delete().eq("id", id);
  if (error) return { error: error.message };
  return done();
}

// An admin resending the reminder email (with the "Inspect now" links) -
// for one ladder, or (no ladderId) every ladder that needs inspecting.
export async function resendLadderReminderAction(ladderId?: string): Promise<{ error?: string; sent?: number }> {
  const supabase = await createClient();
  const { data: role } = await supabase.rpc("current_profile_role");
  if (role !== "admin") return { error: "Only an admin can resend the reminder." };
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const r = await sendLadderReminderNow(origin, ladderId);
  return r.error ? { error: r.error } : { sent: r.sent };
}
