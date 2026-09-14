"use server";

import { revalidatePath } from "next/cache";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";

export async function createClientAction(input: { name: string; notes: string }) {
  const supabase = await requireAppAccess("jobs");

  const { data, error } = await supabase
    .from("clients")
    .insert({ name: input.name, notes: input.notes || null })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/clients");
  return { id: data.id as string };
}

export async function updateClientAction(id: string, input: { name: string; notes: string }) {
  const supabase = await requireAppAccess("jobs");

  const { error } = await supabase
    .from("clients")
    .update({ name: input.name, notes: input.notes || null })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
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
