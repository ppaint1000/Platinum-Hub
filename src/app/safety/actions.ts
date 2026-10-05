"use server";

// Health & safety: saving reports, hazards, tasks, documents and
// contractors. Who can do what is checked by the database (see
// supabase/page_access_and_safety.sql).
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { reportForm, missingRequired, type ReportData } from "@/lib/safety/forms";
import { sendIncidentEmail } from "@/lib/safety/incidentEmail";

type Result = { error?: string; id?: string };

// ── Reports ─────────────────────────────────────────────────────────────

export async function saveReportAction(input: {
  id?: string;
  type: string;
  status: "draft" | "completed";
  siteId: string;
  location: string;
  reportDate: string;
  data: ReportData;
}): Promise<Result> {
  const form = reportForm(input.type);
  if (!form) return { error: "Unknown report." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate)) return { error: "Choose the date." };
  if (input.status === "completed") {
    const missing = missingRequired(form, input.data);
    if (missing.length) return { error: `Fill in: ${missing.join(", ")}.` };
  }
  const supabase = await createClient();
  const row = {
    report_type: input.type,
    status: input.status,
    site_id: input.siteId || null,
    location: input.location.trim() || null,
    report_date: input.reportDate,
    data: input.data,
    updated_at: new Date().toISOString(),
  };

  let id = input.id;
  let wasCompleted = false;
  if (id) {
    const { data: before } = await supabase.from("safety_reports").select("status").eq("id", id).maybeSingle<{ status: string }>();
    wasCompleted = before?.status === "completed";
    const { error } = await supabase.from("safety_reports").update(row).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase.from("safety_reports").insert(row).select("id").single<{ id: string }>();
    if (error) return { error: error.message };
    id = data.id;
  }

  // A new incident: the office hears straight away.
  if (input.type === "incident" && input.status === "completed" && !wasCompleted) await sendIncidentEmail(id);

  revalidatePath("/safety", "layout");
  return { id };
}

export async function deleteReportAction(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("safety_reports").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/safety", "layout");
  return {};
}

// ── Hazard register ─────────────────────────────────────────────────────

export type HazardInput = {
  id?: string;
  hazard: string;
  harm: string;
  riskBefore: string;
  controls: string;
  riskAfter: string;
  responsible: string;
  reviewOn: string;
};

export async function saveHazardAction(h: HazardInput): Promise<Result> {
  if (!h.hazard.trim()) return { error: "Type the hazard." };
  const supabase = await createClient();
  const row = {
    hazard: h.hazard.trim(),
    harm: h.harm.trim() || null,
    risk_before: h.riskBefore || null,
    controls: h.controls.trim() || null,
    risk_after: h.riskAfter || null,
    responsible: h.responsible.trim() || null,
    review_on: h.reviewOn || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = h.id
    ? await supabase.from("safety_hazards").update(row).eq("id", h.id)
    : await supabase.from("safety_hazards").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/safety", "layout");
  return {};
}

export async function setHazardActiveAction(id: string, active: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("safety_hazards").update({ active, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/safety", "layout");
  return {};
}

// ── Tasks ───────────────────────────────────────────────────────────────

export async function addTaskAction(t: { title: string; details: string; assignedTo: string; siteId: string; dueOn: string }): Promise<Result> {
  if (!t.title.trim()) return { error: "Type what needs doing." };
  const supabase = await createClient();
  const { error } = await supabase.from("safety_tasks").insert({
    title: t.title.trim(),
    details: t.details.trim() || null,
    assigned_to: t.assignedTo || null,
    site_id: t.siteId || null,
    due_on: t.dueOn || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/safety", "layout");
  return {};
}

export async function setTaskDoneAction(id: string, done: boolean): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("safety_tasks")
    .update(done ? { status: "done", done_at: new Date().toISOString(), done_by: user?.id ?? null } : { status: "open", done_at: null, done_by: null })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/safety", "layout");
  return {};
}

export async function deleteTaskAction(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("safety_tasks").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/safety", "layout");
  return {};
}

// ── Documents ───────────────────────────────────────────────────────────

// The file goes straight from the browser to storage (big PDFs), then is
// listed here.
export async function addDocumentAction(d: { name: string; category: string; path: string }): Promise<Result> {
  if (!d.path.startsWith(d.category + "/")) return { error: "Upload the file first." };
  const supabase = await createClient();
  const { error } = await supabase.from("safety_documents").insert({ name: d.name.trim() || d.path.split("/").pop(), category: d.category, storage_path: d.path });
  if (error) {
    await supabase.storage.from("safety-documents").remove([d.path]);
    return { error: error.message };
  }
  revalidatePath("/safety/documents");
  return {};
}

export async function documentLinkAction(id: string): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const { data: doc } = await supabase.from("safety_documents").select("storage_path").eq("id", id).maybeSingle<{ storage_path: string }>();
  if (!doc) return { error: "Not found." };
  const { data, error } = await supabase.storage.from("safety-documents").createSignedUrl(doc.storage_path, 300);
  if (error || !data) return { error: error?.message ?? "Couldn't open it." };
  return { url: data.signedUrl };
}

export async function deleteDocumentAction(id: string): Promise<Result> {
  const supabase = await createClient();
  const { data: doc } = await supabase.from("safety_documents").select("storage_path").eq("id", id).maybeSingle<{ storage_path: string }>();
  if (!doc) return { error: "Not found." };
  const { error } = await supabase.from("safety_documents").delete().eq("id", id);
  if (error) return { error: error.message };
  await supabase.storage.from("safety-documents").remove([doc.storage_path]);
  revalidatePath("/safety/documents");
  return {};
}

// ── Contractors ─────────────────────────────────────────────────────────

export type ContractorInput = {
  id?: string;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  trades: string;
  prequalStatus: string;
  prequalExpiresOn: string;
  insuranceExpiresOn: string;
  notes: string;
};

export async function saveContractorAction(c: ContractorInput): Promise<Result> {
  if (!c.company.trim()) return { error: "Type the company name." };
  const supabase = await createClient();
  const row = {
    company: c.company.trim(),
    contact_name: c.contactName.trim() || null,
    email: c.email.trim() || null,
    phone: c.phone.trim() || null,
    trades: c.trades.trim() || null,
    prequal_status: c.prequalStatus || "not_started",
    prequal_expires_on: c.prequalExpiresOn || null,
    insurance_expires_on: c.insuranceExpiresOn || null,
    notes: c.notes.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = c.id
    ? await supabase.from("safety_contractors").update(row).eq("id", c.id)
    : await supabase.from("safety_contractors").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/safety/contractors");
  return {};
}

export async function archiveContractorAction(id: string, archived: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from("safety_contractors").update({ archived, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/safety/contractors");
  return {};
}
