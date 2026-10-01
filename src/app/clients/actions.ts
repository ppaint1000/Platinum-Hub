"use server";

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
  input: { name: string; notes: string; salesPersonId?: string | null }
) {
  const supabase = await requireAppAccess("jobs");
  const update: Record<string, unknown> = { name: input.name, notes: input.notes || null };
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
