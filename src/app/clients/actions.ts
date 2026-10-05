"use server";

import { createAdminClient } from "@/lib/supabase/admin";

import { revalidatePath } from "next/cache";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";

async function isAdmin(supabase: Awaited<ReturnType<typeof requireAppAccess>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase.from("profiles").select("role").eq("id", user?.id ?? "").maybeSingle();
  return data?.role === "admin";
}

// The salesperson is set when the client is new.
export async function createClientAction(input: { name: string; notes: string; salesPersonId: string | null }) {
  const supabase = await requireAppAccess("jobs");

  const { data, error } = await supabase
    .from("clients")
    .insert({ name: input.name, notes: input.notes || null, sales_person_id: input.salesPersonId || null })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/clients");
  return { id: data.id as string };
}

// After that, only an admin can change whose client it is (the database
// enforces this too - see supabase/clients_sales_person.sql).
export async function updateClientAction(
  id: string,
  input: {
    name: string;
    notes: string;
    email: string;
    phone: string;
    address: string;
    salesPersonId?: string | null;
  }
) {
  const supabase = await requireAppAccess("jobs");
  const update: Record<string, unknown> = {
    name: input.name,
    notes: input.notes || null,
    email: input.email.trim() || null,
    phone: input.phone.trim() || null,
    address: input.address.trim() || null,
  };
  if (input.salesPersonId !== undefined) {
    if (!(await isAdmin(supabase))) return { error: "Only an admin can change a client's salesperson." };
    update.sales_person_id = input.salesPersonId || null;
  }

  const { error } = await supabase.from("clients").update(update).eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return {};
}

// Admins: set the salesperson on several clients at once (ticked on the
// Clients table).
export async function setClientsSalesPersonAction(ids: string[], salesPersonId: string | null) {
  const supabase = await requireAppAccess("jobs");
  if (!(await isAdmin(supabase))) return { error: "Only an admin can change a client's salesperson." };
  if (ids.length === 0) return {};

  const { error } = await supabase.from("clients").update({ sales_person_id: salesPersonId }).in("id", ids);
  if (error) return { error: error.message };

  revalidatePath("/clients");
  return {};
}

export async function deleteClientAction(id: string) {
  const supabase = await requireAppAccess("jobs");

  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/clients");
  return {};
}

export async function createContactAction(
  clientId: string,
  input: { name: string; email: string; phone: string; jobId: string | null }
) {
  const supabase = await requireAppAccess("jobs");

  const { error } = await supabase.from("client_contacts").insert({
    client_id: clientId,
    name: input.name,
    email: input.email || null,
    phone: input.phone || null,
    job_id: input.jobId,
  });

  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return {};
}

export async function updateContactAction(
  id: string,
  clientId: string,
  input: { name: string; email: string; phone: string; jobId: string | null }
) {
  const supabase = await requireAppAccess("jobs");

  const { error } = await supabase
    .from("client_contacts")
    .update({
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      job_id: input.jobId,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return {};
}

export async function deleteContactAction(id: string, clientId: string) {
  const supabase = await requireAppAccess("jobs");

  const { error } = await supabase.from("client_contacts").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return {};
}

// Notes on the client's Timeline.
export async function addClientNoteAction(clientId: string, body: string) {
  const supabase = await requireAppAccess("jobs");
  if (!body.trim()) return { error: "Write a note first." };
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("client_notes")
    .insert({ client_id: clientId, body: body.trim(), created_by: user?.id ?? null });
  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return {};
}

export async function deleteClientNoteAction(id: string, clientId: string) {
  const supabase = await requireAppAccess("jobs");

  const { error } = await supabase.from("client_notes").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath(`/clients/${clientId}`);
  return {};
}

// The client's automatic emails (Drips): the main switch, and the
// automations unticked for them. Turning something off also stops those
// emails already on their way.
const TRIGGERS = ["request_created", "proposal_sent", "job_paid", "job_lost"];

export async function setClientAutoEmailsAction(id: string, enabled: boolean, off: string[] = []) {
  const supabase = await requireAppAccess("jobs");
  const dripOff = [...new Set(off.filter((t) => TRIGGERS.includes(t)))];
  const { error } = await supabase.from("clients").update({ drip_opt_out: !enabled, drip_off: dripOff }).eq("id", id);
  if (error) return { error: error.message };
  const stopFor = enabled ? dripOff : TRIGGERS;
  if (stopFor.length) {
    const admin = createAdminClient();
    const { data: seqs } = await admin.from("drip_sequences").select("id").in("trigger", stopFor);
    const ids = (seqs ?? []).map((s) => s.id);
    if (ids.length) {
      await admin
        .from("drip_enrolments")
        .update({ status: "stopped", stopped_reason: "Turned off for this client", next_send_at: null })
        .eq("client_id", id)
        .in("sequence_id", ids)
        .eq("status", "active");
    }
  }
  revalidatePath(`/clients/${id}`);
  return {};
}
