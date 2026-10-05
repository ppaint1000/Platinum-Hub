"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { enrolDrip } from "@/lib/drips/drips";

export type RequestInput = {
  name: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  message: string;
  source: "website" | "phone" | "email" | "referral" | "other";
  ownerId: string | null;
};

const clean = (s: string) => s.trim() || null;

// A new enquiry typed in (a phone call, an email...).
export async function createRequestAction(input: RequestInput) {
  if (!input.name.trim()) return { error: "Enter their name." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: created, error } = await supabase.from("requests").insert({
    name: input.name.trim(),
    company: clean(input.company),
    email: clean(input.email),
    phone: clean(input.phone),
    address: clean(input.address),
    message: clean(input.message),
    source: input.source,
    // Yours unless an admin gives it to someone else.
    owner_id: input.ownerId ?? user?.id ?? null,
  }).select("id").single<{ id: string }>();
  if (error) return { error: error.message };
  // The "New enquiry" emails (Drips page), if they gave an email.
  await enrolDrip({ trigger: "request_created", email: input.email, name: input.name, requestId: created.id });
  revalidatePath("/requests");
  return {};
}

export async function updateRequestAction(id: string, changes: { status?: string; ownerId?: string | null; notes?: string }) {
  const supabase = await createClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (changes.status) update.status = changes.status;
  if (changes.ownerId !== undefined) update.owner_id = changes.ownerId;
  if (changes.notes !== undefined) update.notes = changes.notes;
  const { error } = await supabase.from("requests").update(update).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/requests");
  return {};
}

// Turn a request into a site measure: the client (made from the request if
// they're new), then a draft site measure at their address.
export async function convertRequestAction(id: string, clientId: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: req } = await supabase
    .from("requests")
    .select("id, name, company, email, phone, address, message, owner_id")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      name: string;
      company: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      message: string | null;
      owner_id: string | null;
    }>();
  if (!req) return { error: "Request not found." };

  let client = clientId;
  if (!client) {
    const { data: made, error } = await supabase
      .from("clients")
      .insert({
        name: req.company || req.name,
        email: req.email,
        phone: req.phone,
        address: req.address,
        notes: req.company ? `Contact: ${req.name}` : null,
        sales_person_id: user?.id ?? null,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !made) return { error: "Couldn't add the client - " + (error?.message ?? "") };
    client = made.id;
  }

  const { data: measure, error: mErr } = await supabase
    .from("site_measures")
    .insert({ customer_id: client, location: req.address, email: req.email, status: "draft" })
    .select("id")
    .single<{ id: string }>();
  if (mErr || !measure) return { error: "Couldn't make the site measure - " + (mErr?.message ?? "") };

  await supabase
    .from("requests")
    .update({ status: "converted", client_id: client, site_measure_id: measure.id, updated_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/requests");
  revalidatePath("/site-measures");
  return { measureId: measure.id };
}
