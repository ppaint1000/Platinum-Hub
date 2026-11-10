"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { sendEmail } from "@/lib/email/mailer";
import { renderMarketingEmail, type MailBuilding } from "@/lib/marketing/email";

type Result = { error?: string };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const emailOk = (s: string | null) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// ── Companies ──────────────────────────────────────────────────────────

export type CompanyInput = { id?: string; name: string; category?: string; phone?: string; email?: string; address?: string; website?: string; notes?: string };

export async function saveCompanyAction(c: CompanyInput): Promise<Result> {
  if (!c.name.trim()) return { error: "The company needs a name." };
  if (!emailOk(clean(c.email))) return { error: "That email doesn't look right." };
  const supabase = await requireAdmin();
  const row = { name: c.name.trim(), category: c.category || "Body corporate", phone: clean(c.phone), email: clean(c.email), address: clean(c.address), website: clean(c.website), notes: clean(c.notes) };
  const { error } = c.id ? await supabase.from("marketing_companies").update(row).eq("id", c.id) : await supabase.from("marketing_companies").insert(row);
  if (error) return { error: error.message.includes("duplicate") ? "There's already a company with that name." : error.message };
  revalidatePath("/marketing");
  return {};
}

export async function deleteCompanyAction(id: string): Promise<Result> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("marketing_companies").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/marketing");
  return {};
}

// ── Contacts ───────────────────────────────────────────────────────────

export type ContactInput = {
  id?: string;
  companyId: string | null;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  notes?: string;
  status: string;
  followUp?: string;
  unsubscribed?: boolean;
};

export async function saveContactAction(c: ContactInput): Promise<Result> {
  if (!c.name.trim()) return { error: "The contact needs a name." };
  if (!emailOk(clean(c.email))) return { error: "That email doesn't look right." };
  const supabase = await requireAdmin();
  const row = {
    company_id: c.companyId || null,
    name: c.name.trim(),
    role: clean(c.role),
    phone: clean(c.phone),
    email: clean(c.email),
    notes: clean(c.notes),
    status: c.status || "Not contacted",
    follow_up: clean(c.followUp),
    unsubscribed: !!c.unsubscribed,
  };
  const { error } = c.id ? await supabase.from("marketing_contacts").update(row).eq("id", c.id) : await supabase.from("marketing_contacts").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/marketing");
  return {};
}

export async function deleteContactAction(id: string): Promise<Result> {
  const supabase = await requireAdmin();
  const { error } = await supabase.from("marketing_contacts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/marketing");
  return {};
}

// ── Buildings ──────────────────────────────────────────────────────────

export type BuildingInput = {
  id?: string;
  name: string;
  address?: string;
  companyId: string | null;
  yearPainted?: string;
  description?: string;
  featured: boolean;
  photos: { path: string; url: string }[];
};

export async function saveBuildingAction(b: BuildingInput): Promise<Result> {
  if (!b.name.trim()) return { error: "The building needs a name (or its address)." };
  const year = b.yearPainted?.trim() ? Number(b.yearPainted) : null;
  if (year !== null && (!Number.isInteger(year) || year < 1950 || year > 2100)) return { error: "Year painted should be like 2024." };
  const supabase = await requireAdmin();
  const row = {
    name: b.name.trim(),
    address: clean(b.address),
    company_id: b.companyId || null,
    year_painted: year,
    description: clean(b.description),
    featured: b.featured,
    photos: b.photos,
  };
  const { error } = b.id ? await supabase.from("marketing_buildings").update(row).eq("id", b.id) : await supabase.from("marketing_buildings").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/marketing");
  return {};
}

export async function deleteBuildingAction(id: string): Promise<Result> {
  const supabase = await requireAdmin();
  const { data } = await supabase.from("marketing_buildings").select("photos").eq("id", id).maybeSingle<{ photos: { path: string }[] }>();
  const paths = (data?.photos ?? []).map((p) => p.path).filter(Boolean);
  if (paths.length) await supabase.storage.from("marketing-photos").remove(paths);
  const { error } = await supabase.from("marketing_buildings").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/marketing");
  return {};
}

// ── Sending ────────────────────────────────────────────────────────────

type ContactRow = { id: string; name: string; email: string | null; unsubscribed: boolean; unsubscribe_token: string; company_id: string | null; status: string };
type BuildingRow = MailBuilding & { company_id: string | null; featured: boolean };

const MAX_PER_SEND = 80; // Gmail allows ~500/day; keeps each send well inside that.

async function loadForSend(contactIds: string[]) {
  const supabase = await requireAdmin();
  const [contacts, companies, buildings] = await Promise.all([
    supabase.from("marketing_contacts").select("id, name, email, unsubscribed, unsubscribe_token, company_id, status").in("id", contactIds).returns<ContactRow[]>(),
    supabase.from("marketing_companies").select("id, name, category").returns<{ id: string; name: string; category: string | null }[]>(),
    supabase
      .from("marketing_buildings")
      .select("name, address, year_painted, description, photos, company_id, featured")
      .order("year_painted", { ascending: false, nullsFirst: false })
      .returns<BuildingRow[]>(),
  ]);
  const companyName = new Map((companies.data ?? []).map((c) => [c.id, c.name]));
  const companyGroup = new Map((companies.data ?? []).map((c) => [c.id, c.category ?? "Body corporate"]));
  const all = buildings.data ?? [];
  const featured = all.filter((b) => b.featured);
  // Their own company's buildings first; otherwise starred buildings, the
  // ones from the same group (e.g. other villages for a village) first.
  const pick = (companyId: string | null) => {
    const own = companyId ? all.filter((b) => b.company_id === companyId).slice(0, 4) : [];
    if (own.length) return { list: own, own: true };
    const group = companyId ? companyGroup.get(companyId) : undefined;
    const same = featured.filter((b) => b.company_id && companyGroup.get(b.company_id) === group);
    const list = [...same, ...featured.filter((b) => !same.includes(b))].slice(0, 4);
    return { list, own: false };
  };
  return { supabase, contacts: contacts.data ?? [], companyName, pick };
}

/** Shows what one contact would receive (no email is sent). */
export async function previewEmailAction(subject: string, body: string, contactId: string): Promise<{ error?: string; html?: string; subject?: string; to?: string }> {
  const { contacts, companyName, pick } = await loadForSend([contactId]);
  const c = contacts[0];
  if (!c) return { error: "Contact not found." };
  const b = pick(c.company_id);
  const mail = renderMarketingEmail(subject, body, { name: c.name, email: c.email ?? "", unsubscribe_token: c.unsubscribe_token, company: c.company_id ? companyName.get(c.company_id) ?? null : null }, b.list, b.own);
  return { html: mail.html, subject: mail.subject, to: c.email ?? "(no email)" };
}

/** Sends the email as one contact would see it, to the Hub's own mailbox. */
export async function sendTestAction(subject: string, body: string, contactId: string): Promise<Result & { to?: string }> {
  const me = process.env.GMAIL_USER;
  if (!me) return { error: "Email isn't set up on the Hub (GMAIL_USER)." };
  const { contacts, companyName, pick } = await loadForSend([contactId]);
  const c = contacts[0];
  if (!c) return { error: "Contact not found." };
  const b = pick(c.company_id);
  const mail = renderMarketingEmail(subject, body, { name: c.name, email: me, unsubscribe_token: c.unsubscribe_token, company: c.company_id ? companyName.get(c.company_id) ?? null : null }, b.list, b.own);
  const r = await sendEmail({ to: me, subject: `[TEST] ${mail.subject}`, text: mail.text, html: mail.html, fromName: "Platinum Painters" });
  return r.sent ? { to: me } : { error: r.reason };
}

export async function sendCampaignAction(
  subject: string,
  body: string,
  contactIds: string[],
): Promise<{ error?: string; sent?: number; failed?: number; skipped?: number }> {
  if (!subject.trim() || !body.trim()) return { error: "The email needs a subject and a message." };
  if (!contactIds.length) return { error: "Tick at least one contact to send to." };
  if (contactIds.length > MAX_PER_SEND) return { error: `Send to ${MAX_PER_SEND} or fewer at a time (Gmail's daily limit).` };

  const { supabase, contacts, companyName, pick } = await loadForSend(contactIds);
  const sendable = contacts.filter((c) => c.email && !c.unsubscribed);
  const skipped = contacts.length - sendable.length;
  if (!sendable.length) return { error: "None of the ticked contacts have an email address (or they've unsubscribed)." };

  const { data: campaign, error: campErr } = await supabase
    .from("marketing_campaigns")
    .insert({ subject: subject.trim(), body: body.trim() })
    .select("id")
    .single<{ id: string }>();
  if (campErr || !campaign) return { error: campErr?.message ?? "Couldn't save the campaign." };

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Auckland" });
  let sent = 0;
  let failed = 0;
  for (const c of sendable) {
    const b = pick(c.company_id);
    const mail = renderMarketingEmail(subject, body, { name: c.name, email: c.email!, unsubscribe_token: c.unsubscribe_token, company: c.company_id ? companyName.get(c.company_id) ?? null : null }, b.list, b.own);
    const r = await sendEmail({ to: c.email!, subject: mail.subject, text: mail.text, html: mail.html, fromName: "Platinum Painters" });
    await supabase.from("marketing_sends").insert({
      campaign_id: campaign.id,
      contact_id: c.id,
      to_email: c.email!,
      subject: mail.subject,
      sent: r.sent,
      error: r.sent ? null : r.reason,
    });
    if (r.sent) {
      sent++;
      await supabase
        .from("marketing_contacts")
        .update({ last_contacted: today, ...(c.status === "Not contacted" ? { status: "Emailed" } : {}) })
        .eq("id", c.id);
    } else failed++;
  }
  await supabase.from("marketing_campaigns").update({ sent_count: sent, failed_count: failed, sent_at: new Date().toISOString() }).eq("id", campaign.id);
  revalidatePath("/marketing");
  return { sent, failed, skipped };
}
