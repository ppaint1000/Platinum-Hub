"use client";

// The Marketing page: managers to target (grouped by company, with status
// and follow-up dates), the buildings we've painted (photos, address, the
// company that manages them), and an email to send to a ticked list - each
// manager's email shows the buildings we've done for their company.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, ImagePlus, Mail, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/dashboard/parts";
import {
  deleteBuildingAction,
  deleteCompanyAction,
  deleteContactAction,
  previewEmailAction,
  saveBuildingAction,
  saveCompanyAction,
  saveContactAction,
  sendCampaignAction,
  sendTestAction,
} from "@/app/marketing/actions";
import { GROUPS, MARKETING_PLACEHOLDERS, TEMPLATES, type Group } from "@/lib/marketing/email";

type Company = { id: string; name: string; category: string | null; phone: string | null; email: string | null; address: string | null; website: string | null; notes: string | null };
type Contact = {
  id: string;
  company_id: string | null;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  status: string;
  last_contacted: string | null;
  follow_up: string | null;
  unsubscribed: boolean;
};
type Photo = { path: string; url: string };
type Building = { id: string; name: string; address: string | null; company_id: string | null; year_painted: number | null; description: string | null; photos: Photo[]; featured: boolean };
type Campaign = { id: string; subject: string; sent_count: number; failed_count: number; sent_at: string | null };

export type MarketingData = { companies: Company[]; contacts: Contact[]; buildings: Building[]; campaigns: Campaign[]; todayKey: string };

const STATUSES = ["Not contacted", "Emailed", "Replied", "Meeting booked", "Quoting", "Won", "Not interested"];
const input = "w-full rounded-lg border border-[#D9D6CC] bg-white px-3 py-2 text-sm text-[#16202E]";
const label = "mb-1 block text-xs font-semibold text-[#5B6472]";
const primary = "rounded-lg bg-[#16202E] px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50";
const ghost = "rounded-lg border border-[#D9D6CC] bg-white px-3 py-2 text-sm font-semibold text-[#16202E] hover:bg-[#F5F4F0] disabled:opacity-50";
const fmt = (key: string | null) => (key ? new Date(`${key}T00:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", timeZone: "UTC" }) : "—");

type Tab = "contacts" | "buildings" | "send" | "history";
type GroupFilter = Group | "All";
const groupOf = (c: Company | undefined | null) => (c?.category as Group | null) ?? "Body corporate";

export function MarketingManager({ data }: { data: MarketingData }) {
  const [tab, setTab] = useState<Tab>("contacts");
  const [group, setGroup] = useState<GroupFilter>("All");
  const companyById = new Map(data.companies.map((c) => [c.id, c]));
  const inGroup = (g: GroupFilter, companyId: string | null) => g === "All" || (!!companyId && groupOf(companyById.get(companyId)) === g);
  const groupCount = (g: GroupFilter) => data.contacts.filter((c) => inGroup(g, c.company_id)).length;
  const tabs: [Tab, string][] = [
    ["contacts", `Contacts (${data.contacts.length})`],
    ["buildings", `Buildings (${data.buildings.length})`],
    ["send", "Send email"],
    ["history", "Sent"],
  ];
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-[#5B6472]">
        Body corporate and building managers to target, the buildings we&apos;ve painted, and emails to them. Each email shows the buildings
        we&apos;ve done for that manager&apos;s company (or your starred ones), and always includes our details and an unsubscribe link.
      </p>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === k ? "bg-[#16202E] text-white" : "border border-[#D9D6CC] bg-white text-[#16202E]"}`}>
            {l}
          </button>
        ))}
      </div>
      {(tab === "contacts" || tab === "send") && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-[#5B6472]">Group:</span>
          {(["All", ...GROUPS] as GroupFilter[]).map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`rounded-lg px-3 py-1 font-semibold ${group === g ? "bg-[#1F4E8C] text-white" : "border border-[#D9D6CC] bg-white text-[#16202E]"}`}
            >
              {g} ({groupCount(g)})
            </button>
          ))}
        </div>
      )}
      {tab === "contacts" && <ContactsTab data={data} group={group} />}
      {tab === "buildings" && <BuildingsTab data={data} />}
      {tab === "send" && <SendTab key={group} data={data} group={group} />}
      {tab === "history" && <HistoryTab data={data} />}
    </div>
  );
}

function useAct() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function act(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.error) setMsg(r.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }
  return { msg, setMsg, pending, act };
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#16202E]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-[#F5F4F0]">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={label}>{name}</span>
      {children}
    </label>
  );
}

// A bin button on each row/card: asks first, then deletes and refreshes.
function DeleteButton({ label, confirmText, onDelete, className = "" }: { label: string; confirmText: string; onDelete: () => Promise<{ error?: string }>; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={pending}
      className={`rounded p-1.5 text-[#5B6472] hover:bg-[#FBEAEA] hover:text-[#B91C1C] disabled:opacity-50 ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!confirm(confirmText)) return;
        start(async () => {
          const r = await onDelete();
          if (r.error) alert(r.error);
          else router.refresh();
        });
      }}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

// ── Contacts ───────────────────────────────────────────────────────────

function ContactsTab({ data, group }: { data: MarketingData; group: GroupFilter }) {
  const [editContact, setEditContact] = useState<Partial<Contact> | null>(null);
  const [editCompany, setEditCompany] = useState<Partial<Company> | null>(null);
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const groups = useMemo(() => {
    const companies = data.companies.filter((c) => group === "All" || groupOf(c) === group);
    const list = [...companies.map((c) => ({ company: c as Company | null, key: c.id })), ...(group === "All" ? [{ company: null, key: "none" }] : [])];
    return list
      .map((g) => ({
        ...g,
        contacts: data.contacts.filter(
          (c) => (c.company_id ?? "none") === g.key && (!q || [c.name, c.role, c.email, c.status, g.company?.name].some((v) => v?.toLowerCase().includes(q))),
        ),
      }))
      .filter((g) => g.contacts.length || (g.company && (!q || g.company.name.toLowerCase().includes(q))));
  }, [data, q, group]);
  const due = data.contacts.filter((c) => c.follow_up && c.follow_up <= data.todayKey && !["Won", "Not interested"].includes(c.status));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${input} max-w-xs`} placeholder="Search name, company, status…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className={ghost} onClick={() => setEditCompany({ category: group === "All" ? "Body corporate" : group })}>
          <Plus className="mr-1 inline h-4 w-4" />
          Company
        </button>
        <button className={primary} onClick={() => setEditContact({ status: "Not contacted" })}>
          <Plus className="mr-1 inline h-4 w-4" />
          Contact
        </button>
      </div>
      {due.length > 0 && (
        <p className="rounded-lg bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white">
          Follow-up due: {due.map((c) => c.name).join(", ")}
        </p>
      )}
      {groups.map((g) => (
        <Card key={g.key} className="overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-[#E3E1DA] bg-[#FAF9F6] px-4 py-3">
            <div>
              <div className="font-bold text-[#16202E]">
                {g.company?.name ?? "No company"}
                {g.company && group === "All" && <span className="ml-2 rounded bg-[#F0EEE8] px-1.5 py-0.5 text-xs font-semibold text-[#5B6472]">{groupOf(g.company)}</span>}
              </div>
              {g.company && (
                <div className="text-xs text-[#5B6472]">
                  {[g.company.phone, g.company.email, g.company.address].filter(Boolean).join(" · ")}
                  {g.company.notes && <div className="mt-0.5 italic">{g.company.notes}</div>}
                </div>
              )}
            </div>
            {g.company && (
              <div className="flex shrink-0 items-center gap-0.5">
                <button className="rounded p-1.5 hover:bg-white" aria-label="Edit company" title="Edit company" onClick={() => setEditCompany(g.company!)}>
                  <Pencil className="h-4 w-4" />
                </button>
                <DeleteButton
                  label="Delete company"
                  confirmText={`Delete ${g.company.name}?${g.contacts.length ? ` Its ${g.contacts.length} contact(s) will stay, under "No company".` : ""}`}
                  onDelete={() => deleteCompanyAction(g.company!.id)}
                />
              </div>
            )}
          </div>
          {g.contacts.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[#5B6472]">No contacts yet.</p>
          ) : (
            <ul className="divide-y divide-[#EEECE6]">
              {g.contacts.map((c) => (
                <li key={c.id} className="flex cursor-pointer items-start justify-between gap-3 px-4 py-3 hover:bg-[#FAF9F6]" onClick={() => setEditContact(c)}>
                  <div className="min-w-0">
                    <div className="font-semibold text-[#16202E]">
                      {c.name}
                      {c.unsubscribed && <span className="ml-2 rounded bg-[#F3E8E8] px-1.5 py-0.5 text-xs text-[#B91C1C]">Unsubscribed</span>}
                    </div>
                    <div className="text-xs text-[#5B6472]">{c.role}</div>
                    <div className="mt-0.5 break-all text-xs text-[#3F4753]">{[c.phone, c.email].filter(Boolean).join(" · ") || "No phone or email yet"}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <span className="rounded-full bg-[#EEF2F8] px-2 py-0.5 font-semibold text-[#1F4E8C]">{c.status}</span>
                    {c.last_contacted && <div className="mt-1 text-[#5B6472]">Last: {fmt(c.last_contacted)}</div>}
                    {c.follow_up && <div className={c.follow_up <= data.todayKey ? "mt-0.5 font-bold text-[#B91C1C]" : "mt-0.5 text-[#5B6472]"}>Follow up: {fmt(c.follow_up)}</div>}
                  </div>
                  <DeleteButton label="Delete contact" confirmText={`Delete ${c.name}${c.role ? ` (${c.role})` : ""}?`} onDelete={() => deleteContactAction(c.id)} className="-mr-1.5 -mt-1 shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}
      {editContact && <ContactForm contact={editContact} companies={data.companies} onClose={() => setEditContact(null)} />}
      {editCompany && <CompanyForm company={editCompany} onClose={() => setEditCompany(null)} />}
    </div>
  );
}

function ContactForm({ contact, companies, onClose }: { contact: Partial<Contact>; companies: Company[]; onClose: () => void }) {
  const [f, setF] = useState({
    companyId: contact.company_id ?? "",
    name: contact.name ?? "",
    role: contact.role ?? "",
    phone: contact.phone ?? "",
    email: contact.email ?? "",
    notes: contact.notes ?? "",
    status: contact.status ?? "Not contacted",
    followUp: contact.follow_up ?? "",
    unsubscribed: contact.unsubscribed ?? false,
  });
  const { msg, pending, act } = useAct();
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Modal title={contact.id ? "Edit contact" : "New contact"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field name="Company">
          <select className={input} value={f.companyId} onChange={(e) => set("companyId", e.target.value)}>
            <option value="">— None —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field name="Name">
          <input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field name="Role">
          <input className={input} value={f.role} onChange={(e) => set("role", e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field name="Phone">
            <input className={input} value={f.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field name="Email">
            <input className={input} type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field name="Status">
            <select className={input} value={f.status} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field name="Follow-up date">
            <input className={input} type="date" value={f.followUp} onChange={(e) => set("followUp", e.target.value)} />
          </Field>
        </div>
        <Field name="Notes">
          <textarea className={input} rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.unsubscribed} onChange={(e) => set("unsubscribed", e.target.checked)} />
          Unsubscribed - don&apos;t send marketing emails
        </label>
        {msg && <p className="text-sm font-semibold text-[#B91C1C]">{msg}</p>}
        <div className="flex justify-between gap-2 pt-2">
          {contact.id ? (
            <button
              className={ghost}
              disabled={pending}
              onClick={() => confirm(`Delete ${contact.name}?`) && act(() => deleteContactAction(contact.id!), onClose)}
            >
              <Trash2 className="inline h-4 w-4" />
            </button>
          ) : (
            <span />
          )}
          <button className={primary} disabled={pending} onClick={() => act(() => saveContactAction({ id: contact.id, ...f, companyId: f.companyId || null }), onClose)}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CompanyForm({ company, onClose }: { company: Partial<Company>; onClose: () => void }) {
  const [f, setF] = useState({
    name: company.name ?? "",
    category: company.category ?? "Body corporate",
    phone: company.phone ?? "",
    email: company.email ?? "",
    address: company.address ?? "",
    website: company.website ?? "",
    notes: company.notes ?? "",
  });
  const { msg, pending, act } = useAct();
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Modal title={company.id ? "Edit company" : "New company"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field name="Group">
          <select className={input} value={f.category} onChange={(e) => set("category", e.target.value)}>
            {GROUPS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </Field>
        {(["name", "phone", "email", "address", "website"] as const).map((k) => (
          <Field key={k} name={k[0].toUpperCase() + k.slice(1)}>
            <input className={input} value={f[k]} onChange={(e) => set(k, e.target.value)} />
          </Field>
        ))}
        <Field name="Notes">
          <textarea className={input} rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
        {msg && <p className="text-sm font-semibold text-[#B91C1C]">{msg}</p>}
        <div className="flex justify-between gap-2 pt-2">
          {company.id ? (
            <button
              className={ghost}
              disabled={pending}
              onClick={() => confirm(`Delete ${company.name}? Its contacts and buildings stay, with no company.`) && act(() => deleteCompanyAction(company.id!), onClose)}
            >
              <Trash2 className="inline h-4 w-4" />
            </button>
          ) : (
            <span />
          )}
          <button className={primary} disabled={pending} onClick={() => act(() => saveCompanyAction({ id: company.id, ...f }), onClose)}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Buildings ──────────────────────────────────────────────────────────

function BuildingsTab({ data }: { data: MarketingData }) {
  const [edit, setEdit] = useState<Partial<Building> | null>(null);
  const companyName = new Map(data.companies.map((c) => [c.id, c.name]));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[#5B6472]">Star a few of your best buildings - they&apos;re shown to managers you haven&apos;t worked with yet.</p>
        <button className={primary} onClick={() => setEdit({ photos: [], featured: false })}>
          <Plus className="mr-1 inline h-4 w-4" />
          Building
        </button>
      </div>
      {data.buildings.length === 0 ? (
        <Card className="p-6 text-sm text-[#5B6472]">No buildings yet. Add the body corporate buildings you&apos;ve painted, with a photo or two each.</Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.buildings.map((b) => (
            <Card key={b.id} className="relative cursor-pointer overflow-hidden hover:shadow-md">
              <DeleteButton
                label="Delete building"
                confirmText={`Delete ${b.name} and its photos?`}
                onDelete={() => deleteBuildingAction(b.id)}
                className="absolute right-2 top-2 z-10 bg-white/90 shadow-sm"
              />
              <div onClick={() => setEdit(b)}>
                {b.photos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.photos[0].url} alt={b.name} className="h-44 w-full object-cover" />
                ) : (
                  <div className="flex h-44 items-center justify-center bg-[#F5F4F0] text-[#9AA1AC]">
                    <Building2 className="h-10 w-10" />
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-center gap-1 font-bold text-[#16202E]">
                    {b.featured && <Star className="h-4 w-4 fill-[#E0A800] text-[#E0A800]" />}
                    {b.name}
                  </div>
                  <div className="text-xs text-[#5B6472]">{[b.address, b.year_painted ? `Painted ${b.year_painted}` : null].filter(Boolean).join(" · ")}</div>
                  <div className="mt-1 text-xs font-semibold text-[#1F4E8C]">{b.company_id ? companyName.get(b.company_id) : "No management company"}</div>
                  {b.photos.length > 1 && <div className="mt-1 text-xs text-[#5B6472]">{b.photos.length} photos</div>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {edit && <BuildingForm building={edit} companies={data.companies} onClose={() => setEdit(null)} />}
    </div>
  );
}

// Phone photos are big; shrink to 1600px JPEG so they load fast in emails.
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.82));
  } catch {
    return file;
  }
}

function BuildingForm({ building, companies, onClose }: { building: Partial<Building>; companies: Company[]; onClose: () => void }) {
  const [f, setF] = useState({
    name: building.name ?? "",
    address: building.address ?? "",
    companyId: building.company_id ?? "",
    yearPainted: building.year_painted ? String(building.year_painted) : "",
    description: building.description ?? "",
    featured: building.featured ?? false,
  });
  const [photos, setPhotos] = useState<Photo[]>(building.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const { msg, setMsg, pending, act } = useAct();
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setMsg(null);
    const supabase = createClient();
    const added: Photo[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const blob = await shrink(file);
      const path = `buildings/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await supabase.storage.from("marketing-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (error) {
        setMsg(error.message);
        break;
      }
      added.push({ path, url: supabase.storage.from("marketing-photos").getPublicUrl(path).data.publicUrl });
    }
    setPhotos((p) => [...p, ...added]);
    setUploading(false);
  }

  function removePhoto(i: number) {
    const p = photos[i];
    setPhotos((list) => list.filter((_, j) => j !== i));
    // Only delete straight away if it was never saved on the building.
    if (!(building.photos ?? []).some((x) => x.path === p.path)) createClient().storage.from("marketing-photos").remove([p.path]);
  }

  function makeFirst(i: number) {
    setPhotos((list) => [list[i], ...list.filter((_, j) => j !== i)]);
  }

  return (
    <Modal title={building.id ? "Edit building" : "New building"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Field name="Building name">
          <input className={input} placeholder="e.g. The Hawthorne Apartments" value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field name="Address">
          <input className={input} value={f.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field name="Managed by">
          <select className={input} value={f.companyId} onChange={(e) => set("companyId", e.target.value)}>
            <option value="">— Not known —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field name="Year painted">
          <input className={input} inputMode="numeric" placeholder="2025" value={f.yearPainted} onChange={(e) => set("yearPainted", e.target.value)} />
        </Field>
        <Field name="Short description (shown in emails)">
          <textarea className={input} rows={2} placeholder="e.g. Full exterior repaint, 24 units, Resene Sonyx 101" value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div>
          <span className={label}>Photos (the first one is shown in emails)</span>
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div key={p.path} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className={`h-24 w-full rounded-lg object-cover ${i === 0 ? "ring-2 ring-[#1F4E8C]" : ""}`} onClick={() => makeFirst(i)} />
                <button type="button" onClick={() => removePhoto(i)} aria-label="Remove photo" className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <label className="flex h-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#D9D6CC] text-xs text-[#5B6472] hover:bg-[#F5F4F0]">
              <ImagePlus className="mb-1 h-5 w-5" />
              {uploading ? "Uploading…" : "Add photos"}
              <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={(e) => addPhotos(e.target.files)} />
            </label>
          </div>
          {photos.length > 1 && <p className="mt-1 text-xs text-[#5B6472]">Tap a photo to make it the main one.</p>}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.featured} onChange={(e) => set("featured", e.target.checked)} />
          Star it - show to managers we haven&apos;t worked with yet
        </label>
        {msg && <p className="text-sm font-semibold text-[#B91C1C]">{msg}</p>}
        <div className="flex justify-between gap-2 pt-2">
          {building.id ? (
            <button className={ghost} disabled={pending} onClick={() => confirm(`Delete ${building.name} and its photos?`) && act(() => deleteBuildingAction(building.id!), onClose)}>
              <Trash2 className="inline h-4 w-4" />
            </button>
          ) : (
            <span />
          )}
          <button
            className={primary}
            disabled={pending || uploading}
            onClick={() => act(() => saveBuildingAction({ id: building.id, ...f, companyId: f.companyId || null, photos }), onClose)}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Send ───────────────────────────────────────────────────────────────

function SendTab({ data, group }: { data: MarketingData; group: GroupFilter }) {
  // Each group starts with its own wording (All uses the body corporate one).
  const template = TEMPLATES[group === "All" ? "Body corporate" : group];
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const companyById = new Map(data.companies.map((c) => [c.id, c]));
  const sendable = data.contacts.filter(
    (c) => c.email && !c.unsubscribed && (group === "All" || (!!c.company_id && groupOf(companyById.get(c.company_id)) === group)),
  );
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [preview, setPreview] = useState<{ html: string; subject: string; to: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const { msg, setMsg, pending, act } = useAct();
  const [busy, start] = useTransition();
  const companyName = new Map(data.companies.map((c) => [c.id, c.name]));
  const shown = sendable.filter((c) => (!companyFilter || c.company_id === companyFilter) && (!statusFilter || c.status === statusFilter));
  const noEmail = data.contacts.filter(
    (c) => !c.email && !c.unsubscribed && (group === "All" || (!!c.company_id && groupOf(companyById.get(c.company_id)) === group)),
  ).length;
  const firstTicked = data.contacts.find((c) => ticked.has(c.id)) ?? sendable[0];
  const resetWording = () => {
    setSubject(template.subject);
    setBody(template.body);
  };

  const toggle = (id: string) => setTicked((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s).add(id)));
  const tickShown = () => setTicked((s) => new Set([...s, ...shown.map((c) => c.id)]));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="flex flex-col gap-3 p-4">
        <Field name="Subject">
          <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field name="Message">
          <textarea className={`${input} font-mono text-[13px]`} rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <p className="text-xs text-[#5B6472]">
          Wording for: <span className="font-semibold text-[#16202E]">{group === "All" ? "Body corporate (pick a group above for other wording)" : group}</span> ·{" "}
          <button className="font-semibold text-[#1F4E8C] hover:underline" onClick={resetWording}>
            Reset to the starting wording
          </button>
        </p>
        <div className="text-xs text-[#5B6472]">
          {MARKETING_PLACEHOLDERS.map(([k, d]) => (
            <div key={k}>
              <code className="font-semibold text-[#16202E]">{k}</code> - {d}
            </div>
          ))}
          <div className="mt-1">Our name, address, phone and an unsubscribe link are added to the bottom of every email.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={ghost}
            disabled={!firstTicked || busy}
            onClick={() =>
              start(async () => {
                setNote(null);
                const r = await previewEmailAction(subject, body, firstTicked!.id);
                if (r.error) setNote(r.error);
                else setPreview({ html: r.html!, subject: r.subject!, to: r.to! });
              })
            }
          >
            Preview
          </button>
          <button
            className={ghost}
            disabled={!firstTicked || busy}
            onClick={() =>
              start(async () => {
                setNote(null);
                const r = await sendTestAction(subject, body, firstTicked!.id);
                setNote(r.error ?? `Test sent to ${r.to} (as ${firstTicked!.name} would see it).`);
              })
            }
          >
            <Mail className="mr-1 inline h-4 w-4" />
            Send me a test
          </button>
        </div>
        {note && <p className="text-sm text-[#1F4E8C]">{note}</p>}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          <select className={`${input} w-auto`} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
            <option value="">All companies</option>
            {data.companies.filter((c) => group === "All" || groupOf(c) === group).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className={`${input} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-[#16202E]">{ticked.size} ticked</span>
          <span className="flex gap-3">
            <button className="font-semibold text-[#1F4E8C] hover:underline" onClick={tickShown}>
              Tick all shown
            </button>
            <button className="font-semibold text-[#1F4E8C] hover:underline" onClick={() => setTicked(new Set())}>
              Clear
            </button>
          </span>
        </div>
        <ul className="max-h-[420px] divide-y divide-[#EEECE6] overflow-y-auto rounded-lg border border-[#E3E1DA]">
          {shown.length === 0 && <li className="px-3 py-4 text-sm text-[#5B6472]">No contacts with an email match.</li>}
          {shown.map((c) => (
            <li key={c.id}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-[#FAF9F6]">
                <input type="checkbox" className="mt-1" checked={ticked.has(c.id)} onChange={() => toggle(c.id)} />
                <span className="min-w-0 text-sm">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-[#5B6472]"> · {c.company_id ? companyName.get(c.company_id) : "No company"}</span>
                  <span className="block break-all text-xs text-[#5B6472]">
                    {c.email} · {c.status}
                    {c.last_contacted && ` · last emailed ${fmt(c.last_contacted)}`}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {noEmail > 0 && <p className="text-xs text-[#5B6472]">{noEmail} contacts have no email yet - add one on the Contacts tab to include them.</p>}
        {msg && <p className="text-sm font-semibold text-[#1F4E8C]">{msg}</p>}
        <button
          className={primary}
          disabled={pending || ticked.size === 0}
          onClick={() => {
            if (!confirm(`Send "${subject}" to ${ticked.size} ${ticked.size === 1 ? "person" : "people"}?`)) return;
            act(async () => {
              const r = await sendCampaignAction(subject, body, [...ticked]);
              if (r.error) return r;
              setMsg(`Sent ${r.sent}${r.failed ? `, ${r.failed} failed (see Sent tab)` : ""}${r.skipped ? `, ${r.skipped} skipped (no email / unsubscribed)` : ""}.`);
              setTicked(new Set());
              return {};
            });
          }}
        >
          {pending ? "Sending… keep this page open" : `Send to ${ticked.size} ${ticked.size === 1 ? "person" : "people"}`}
        </button>
      </Card>

      {preview && (
        <Modal title="Preview" onClose={() => setPreview(null)}>
          <div className="mb-2 text-xs text-[#5B6472]">
            To: {preview.to}
            <br />
            Subject: <span className="font-semibold text-[#16202E]">{preview.subject}</span>
          </div>
          <div className="rounded-lg border border-[#E3E1DA] p-3" dangerouslySetInnerHTML={{ __html: preview.html }} />
        </Modal>
      )}
    </div>
  );
}

// ── History ────────────────────────────────────────────────────────────

function HistoryTab({ data }: { data: MarketingData }) {
  if (!data.campaigns.length) return <Card className="p-6 text-sm text-[#5B6472]">Nothing sent yet.</Card>;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-[#EEECE6]">
        {data.campaigns.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <div className="font-semibold text-[#16202E]">{c.subject}</div>
              <div className="text-xs text-[#5B6472]">
                {c.sent_at && new Date(c.sent_at).toLocaleString("en-NZ", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland" })}
              </div>
            </div>
            <div className="text-right text-xs">
              <div className="font-semibold text-[#16202E]">{c.sent_count} sent</div>
              {c.failed_count > 0 && <div className="font-semibold text-[#B91C1C]">{c.failed_count} failed</div>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
