"use client";

// One client, laid out like PaintScout's contact page: the name with quick
// Map / Call / Email buttons, then Overview (Details, Contacts, Jobs) and a
// Timeline of everything that's happened with them, plus notes.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Check, Mail, MapPin, Phone, Plus, Trash2 } from "lucide-react";
import { addClientNoteAction, deleteClientNoteAction } from "@/app/clients/actions";
import { ClientEditForm, ContactsList, type ClientDetailRow, type ContactRow } from "./ClientDetail";
import { Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { isWonStatus, type JobStatus } from "@/lib/jobs/status";

export type ClientJob = {
  id: string;
  job_number: string | null;
  name: string;
  status: JobStatus;
  quoted_sell_total: number | null;
  quoted_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_to: string | null;
  lead_source: string | null;
  lead_by_user_id: string | null;
  created_at: string;
  proposal_url: string | null;
  proposal_sent_at: string | null;
  proposal_viewed_at: string | null;
  proposal_view_count: number | null;
  proposal_accepted_at: string | null;
};
export type ClientNote = { id: string; body: string; created_at: string; author: string | null };
export type ClientPageRow = ClientDetailRow & { created_at: string; updated_at: string };

// Dashboard colours (components/dashboard/parts.tsx).
const NAVY = "#16202E";
const RED = "#B91C1C";
const GREY = "#5B6472";
const BLUE = "#1F4E8C";
const TZ = "Pacific/Auckland";

const STATUS: Record<ClientJob["status"], { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: "#ECEAE3", fg: "#3F4753" },
  quoted: { label: "Quoted", bg: "#ECEAE3", fg: "#3F4753" },
  on_hold: { label: "On hold", bg: "#ECEAE3", fg: "#3F4753" },
  won: { label: "Won · to be scheduled", bg: "#E3ECF8", fg: "#163A69" },
  scheduled: { label: "Scheduled", bg: "#E3ECF8", fg: "#163A69" },
  in_progress: { label: "In progress", bg: "#E3ECF8", fg: "#163A69" },
  complete: { label: "Complete", bg: "#E3ECF8", fg: "#163A69" },
  invoiced: { label: "Invoiced", bg: "#E3ECF8", fg: "#163A69" },
  paid: { label: "Paid", bg: "#E3ECF8", fg: "#163A69" },
  lost: { label: "Lost", bg: RED, fg: "#FFFFFF" },
};
const isWon = (s: ClientJob["status"]) => isWonStatus(s);

const money = (n: number) => "$" + n.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Plain dates (quoted, lost) are a day, not a moment - midday NZ that day.
const toTime = (v: string) => Date.parse(v.length === 10 ? `${v}T12:00:00+12:00` : v);
const fmtDay = (v: string) =>
  new Date(toTime(v)).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
const fmtTime = (v: string) =>
  v.length === 10 ? "" : new Date(v).toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit", timeZone: TZ });
const jobLabel = (j: ClientJob) => (j.job_number ? `${j.job_number} · ${j.name}` : j.name);

type Event = {
  key: string;
  at: string;
  kind: "note" | "quoted" | "sent" | "opened" | "accepted" | "won" | "lost" | "created";
  text: string;
  job?: ClientJob;
  note?: ClientNote;
};

function buildTimeline(client: ClientPageRow, jobs: ClientJob[], notes: ClientNote[]): Event[] {
  const events: Event[] = notes.map((n) => ({ key: `note-${n.id}`, at: n.created_at, kind: "note", text: n.body, note: n }));
  for (const j of jobs) {
    const value = j.quoted_sell_total ? ` · ${money(Number(j.quoted_sell_total))}` : "";
    const add = (kind: Event["kind"], at: string | null, text: string) =>
      at && events.push({ key: `${j.id}-${kind}`, at, kind, text, job: j });
    add("quoted", j.quoted_at, `Quoted${value}`);
    add("sent", j.proposal_sent_at, "Proposal sent");
    if (Number(j.proposal_view_count ?? 0) > 0)
      add("opened", j.proposal_viewed_at, `Proposal opened ${j.proposal_view_count}×`);
    if (j.proposal_accepted_at) add("accepted", j.proposal_accepted_at, `Accepted online${value}`);
    else if (isWon(j.status)) add("won", j.won_at, `Won${value}`);
    if (j.status === "lost") add("lost", j.lost_at, `Lost${j.lost_to ? ` to ${j.lost_to}` : ""}${value}`);
  }
  events.push({ key: "created", at: client.created_at, kind: "created", text: "Added to the Hub" });
  return events.sort((a, b) => toTime(b.at) - toTime(a.at));
}

const EVENT_COLOR: Record<Event["kind"], string> = {
  note: NAVY,
  quoted: GREY,
  sent: GREY,
  opened: BLUE,
  accepted: BLUE,
  won: BLUE,
  lost: RED,
  created: "#5B6472",
};

// A clock-in site belonging to this client (Timesheets → Sites).
export type ClientSite = { id: string; name: string; address: string | null; is_active: boolean };

export function ClientPage({
  client,
  contacts,
  jobs,
  notes,
  sites = [],
  salesTeam,
  canChangeSalesPerson,
}: {
  client: ClientPageRow;
  contacts: ContactRow[];
  jobs: ClientJob[];
  notes: ClientNote[];
  sites?: ClientSite[];
  salesTeam: { id: string; name: string }[];
  canChangeSalesPerson: boolean;
}) {
  const [view, setView] = useState<"overview" | "timeline">("overview");
  const [tab, setTab] = useState<"details" | "contacts" | "jobs" | "sites">("details");
  const [editing, setEditing] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [focusNote, setFocusNote] = useState(false);

  useEffect(() => {
    if (view === "timeline" && focusNote) {
      noteRef.current?.focus();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot focus request
      setFocusNote(false);
    }
  }, [view, focusNote]);

  // Call / Email use the client's own details, else the first contact's.
  const phone = client.phone || contacts.find((c) => c.phone)?.phone || null;
  const email = client.email || contacts.find((c) => c.email)?.email || null;
  const salesPerson = client.sales_person_id
    ? salesTeam.find((p) => p.id === client.sales_person_id)?.name ?? "Former salesperson"
    : null;
  const sources = [...new Set(jobs.map((j) => j.lead_source).filter((s): s is string => !!s))];

  const decided = jobs.filter((j) => isWon(j.status) || j.status === "lost");
  const won = jobs.filter((j) => isWon(j.status));
  const quoted = jobs.filter((j) => j.status !== "draft");
  const winRate = decided.length ? Math.round((won.length / decided.length) * 100) : null;
  const wonValue = won.reduce((s, j) => s + Number(j.quoted_sell_total ?? 0), 0);

  const actionBtn =
    "flex h-11 w-11 items-center justify-center rounded-lg text-white transition hover:opacity-90";
  const disabledBtn = "flex h-11 w-11 items-center justify-center rounded-lg bg-[#C9CDD3] text-white";

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/clients"
        aria-label="Back to Clients"
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Clients
      </Link>

      {/* Name and quick actions */}
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center gap-3">
          {client.address ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Map"
              aria-label="Open the address in Google Maps"
              className={actionBtn}
              style={{ background: BLUE }}
            >
              <MapPin className="h-5 w-5" />
            </a>
          ) : (
            <span title="No address yet" aria-label="No address yet" className={disabledBtn}>
              <MapPin className="h-5 w-5" />
            </span>
          )}
          {phone ? (
            <a href={`tel:${phone.replace(/\s+/g, "")}`} title={`Call ${phone}`} aria-label={`Call ${phone}`} className={actionBtn} style={{ background: BLUE }}>
              <Phone className="h-5 w-5" />
            </a>
          ) : (
            <span title="No phone number yet" aria-label="No phone number yet" className={disabledBtn}>
              <Phone className="h-5 w-5" />
            </span>
          )}
          {email ? (
            <a href={`mailto:${email}`} title={`Email ${email}`} aria-label={`Email ${email}`} className={actionBtn} style={{ background: BLUE }}>
              <Mail className="h-5 w-5" />
            </a>
          ) : (
            <span title="No email yet" aria-label="No email yet" className={disabledBtn}>
              <Mail className="h-5 w-5" />
            </span>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPlusOpen((v) => !v)}
              aria-expanded={plusOpen}
              aria-label="Add"
              title="Add"
              className="flex h-11 w-11 items-center justify-center rounded-lg border-2 bg-white transition hover:bg-[#E3ECF8]"
              style={{ borderColor: BLUE, color: BLUE }}
            >
              <Plus className="h-5 w-5" />
            </button>
            {plusOpen && (
              <div className="absolute left-1/2 z-20 mt-2 w-44 -translate-x-1/2 rounded-lg border border-line bg-white p-1 text-left text-sm shadow-xl">
                {[
                  { label: "Add a note", go: () => { setView("timeline"); setFocusNote(true); } },
                  { label: "Add a contact", go: () => { setView("overview"); setTab("contacts"); } },
                  { label: "Edit details", go: () => { setView("overview"); setTab("details"); setEditing(true); } },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setPlusOpen(false);
                      item.go();
                    }}
                    className="block w-full rounded-md px-3 py-2 text-left hover:bg-[#F5F4F0]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Overview | Timeline */}
        <div className="flex items-center gap-3 text-sm" role="tablist">
          {(["overview", "timeline"] as const).map((v, i) => (
            <span key={v} className="flex items-center gap-3">
              {i > 0 && <span className="text-line">|</span>}
              <button
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`border-b-2 pb-1 capitalize ${
                  view === v ? "font-semibold" : "border-transparent text-ink-soft hover:text-ink"
                }`}
                style={view === v ? { borderColor: BLUE, color: BLUE } : undefined}
              >
                {v}
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Quick figures */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Quotes", value: String(quoted.length) },
          { label: "Won", value: String(won.length) },
          { label: "Win rate", value: winRate === null ? "—" : `${winRate}%` },
          { label: "Won $", value: wonValue > 0 ? "$" + Math.round(wonValue).toLocaleString("en-NZ") : "—" },
        ].map((f) => (
          <div key={f.label} className="rounded-xl border border-line bg-paper-raised px-3 py-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{f.label}</p>
            <p className="text-lg font-bold text-ink">{f.value}</p>
          </div>
        ))}
      </div>

      {view === "overview" ? (
        <div className="rounded-xl border border-line bg-paper-raised">
          <div className="flex flex-wrap gap-2 border-b border-line p-3" role="tablist">
            {(
              [
                ["details", "Details"],
                ["contacts", `Contacts (${contacts.length})`],
                ["jobs", `Jobs (${jobs.length})`],
                ["sites", `Sites (${sites.length})`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === k ? "text-white" : "border border-line bg-white text-ink hover:bg-[#F5F4F0]"
                }`}
                style={tab === k ? { background: BLUE } : undefined}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === "details" &&
              (editing ? (
                <ClientEditForm
                  client={client}
                  salesTeam={salesTeam}
                  canChangeSalesPerson={canChangeSalesPerson}
                  onDone={() => setEditing(false)}
                />
              ) : (
                <div className="flex flex-col">
                  <DetailRow label="Address" value={client.address} />
                  <DetailRow label="Email" value={client.email} href={client.email ? `mailto:${client.email}` : undefined} />
                  <DetailRow label="Phone" value={client.phone} href={client.phone ? `tel:${client.phone.replace(/\s+/g, "")}` : undefined} />
                  <DetailRow label="Salesperson" value={salesPerson} empty="No salesperson yet" copy={false} />
                  <DetailRow label="Lead source" value={sources.join(", ") || null} empty="Not recorded on any job" copy={false} />
                  <DetailRow label="Date added" value={fmtDay(client.created_at)} copy={false} />
                  <DetailRow label="Notes" value={client.notes} copy={false} multiline />
                  <div className="pt-3">
                    <Button variant="secondary" onClick={() => setEditing(true)}>
                      Edit details
                    </Button>
                  </div>
                </div>
              ))}

            {tab === "contacts" && (
              <ContactsList
                clientId={client.id}
                contacts={contacts}
                jobs={jobs.map((j) => ({ id: j.id, job_number: j.job_number, name: j.name }))}
              />
            )}

            {tab === "jobs" && <JobsList jobs={jobs} />}

            {tab === "sites" &&
              (sites.length === 0 ? (
                <p className="text-sm text-ink-soft">
                  No clock-in sites for this client.{" "}
                  <Link href="/timesheets/admin/sites" className="underline">
                    Add one on Sites
                  </Link>
                  .
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {sites.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                      <div>
                        <Link href={`/timesheets/admin/sites/${s.id}`} className="font-medium text-ink underline">
                          {s.name}
                        </Link>
                        {s.address && <p className="text-sm text-ink-soft">{s.address}</p>}
                      </div>
                      <span className="text-xs text-ink-soft">{s.is_active ? "Active" : "Archived"}</span>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
        </div>
      ) : (
        <Timeline client={client} jobs={jobs} notes={notes} noteRef={noteRef} />
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  href,
  empty = "—",
  copy = true,
  multiline = false,
}: {
  label: string;
  value: string | null;
  href?: string;
  empty?: string;
  copy?: boolean;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function doCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked - nothing to do.
    }
  }
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-soft">{label}</p>
        {value ? (
          href ? (
            <a href={href} className="break-words text-sm text-ink hover:underline">
              {value}
            </a>
          ) : (
            <p className={`break-words text-sm text-ink ${multiline ? "whitespace-pre-wrap" : ""}`}>{value}</p>
          )
        ) : (
          <p className="text-sm text-ink-faint">{empty}</p>
        )}
      </div>
      {copy && value && (
        <button
          type="button"
          onClick={doCopy}
          title={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
          aria-label={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
          className="shrink-0 rounded p-1.5 text-ink-faint hover:bg-[#F5F4F0] hover:text-ink"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

function JobsList({ jobs }: { jobs: ClientJob[] }) {
  if (jobs.length === 0) return <p className="text-sm text-ink-soft">No jobs or quotes for this client yet.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {jobs.map((j) => {
        const st = STATUS[j.status];
        const views = Number(j.proposal_view_count ?? 0);
        return (
          <li key={j.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-xs font-semibold" style={{ background: st.bg, color: st.fg }}>
                  {st.label}
                </span>
                <Link href={`/jobs/${j.id}`} className="font-semibold hover:underline" style={{ color: BLUE }}>
                  {jobLabel(j)}
                </Link>
              </span>
              <span className="text-xs text-ink-soft">
                {[
                  j.quoted_at && `Quoted ${fmtDay(j.quoted_at)}`,
                  isWon(j.status) && j.won_at && `Won ${fmtDay(j.won_at)}`,
                  j.status === "lost" && `Lost${j.lost_to ? ` to ${j.lost_to}` : ""}${j.lost_at ? ` ${fmtDay(j.lost_at)}` : ""}`,
                  j.lead_source && `Lead: ${j.lead_source}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {j.proposal_url && (
                <span className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className={views > 0 ? "font-semibold" : "text-ink-soft"} style={views > 0 ? { color: BLUE } : undefined}>
                    {j.proposal_accepted_at
                      ? `Accepted online ${fmtDay(j.proposal_accepted_at)}`
                      : views > 0
                        ? `Proposal opened ${views}×${j.proposal_viewed_at ? ` · last ${fmtDay(j.proposal_viewed_at)}` : ""}`
                        : j.proposal_sent_at
                          ? `Proposal sent ${fmtDay(j.proposal_sent_at)} · not opened yet`
                          : "Proposal not sent yet"}
                  </span>
                  <a href={j.proposal_url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline" style={{ color: BLUE }}>
                    View proposal
                  </a>
                </span>
              )}
            </div>
            <span className="shrink-0 text-sm font-bold">
              {j.quoted_sell_total ? money(Number(j.quoted_sell_total)) : "—"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Timeline({
  client,
  jobs,
  notes,
  noteRef,
}: {
  client: ClientPageRow;
  jobs: ClientJob[];
  notes: ClientNote[];
  noteRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "notes">("all");

  const events = buildTimeline(client, jobs, notes).filter((e) => filter === "all" || e.kind === "note");
  // Grouped by day, newest first.
  const days: { day: string; events: Event[] }[] = [];
  for (const e of events) {
    const day = fmtDay(e.at);
    const last = days[days.length - 1];
    if (last?.day === day) last.events.push(e);
    else days.push({ day, events: [e] });
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await addClientNoteAction(client.id, body);
    setSaving(false);
    if (result.error) return setError(result.error);
    setBody("");
    router.refresh();
  }

  async function removeNote(id: string) {
    if (!window.confirm("Delete this note?")) return;
    const result = await deleteClientNoteAction(id, client.id);
    if (result.error) return setError(result.error);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-line bg-paper-raised">
      <div className="flex flex-wrap gap-2 border-b border-line p-3" role="tablist">
        {(
          [
            ["all", "All activity"],
            ["notes", `Notes (${notes.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={filter === k}
            onClick={() => setFilter(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              filter === k ? "text-white" : "border border-line bg-white text-ink hover:bg-[#F5F4F0]"
            }`}
            style={filter === k ? { background: BLUE } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={addNote} className="flex flex-col gap-2 border-b border-line p-4">
        <textarea
          ref={noteRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="Write a note about this client…"
          aria-label="New note"
          className="w-full rounded-md border border-line px-3 py-2 text-sm"
        />
        {error && (
          <p className="text-sm" style={{ color: overBudgetColor }}>
            {error}
          </p>
        )}
        <div>
          <Button type="submit" disabled={saving || !body.trim()}>
            {saving ? "Saving…" : "Add note"}
          </Button>
        </div>
      </form>

      <div className="p-4">
        {days.length === 0 ? (
          <p className="text-sm text-ink-soft">No notes yet.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {days.map((d) => (
              <section key={d.day}>
                <p className="mb-2 text-xs font-medium text-ink-faint">{d.day}</p>
                <ol className="flex flex-col gap-3 border-l-2 border-line pl-4">
                  {d.events.map((e) => (
                    <li key={e.key} className="relative">
                      <span
                        className="absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full border-2 border-white"
                        style={{ background: EVENT_COLOR[e.kind] }}
                        aria-hidden
                      />
                      {e.kind === "note" && e.note ? (
                        <div className="rounded-md bg-[#F5F4F0] px-3 py-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="whitespace-pre-wrap text-sm text-ink">{e.note.body}</p>
                            <button
                              type="button"
                              onClick={() => removeNote(e.note!.id)}
                              aria-label="Delete note"
                              title="Delete note"
                              className="shrink-0 rounded p-1 text-ink-faint hover:bg-white hover:text-ink"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="mt-1 text-xs text-ink-faint">
                            {e.note.author ?? "Note"} · {fmtTime(e.at)}
                          </p>
                        </div>
                      ) : (
                        <div className="text-sm">
                          <p className="font-semibold" style={{ color: EVENT_COLOR[e.kind] }}>
                            {e.text}
                          </p>
                          {e.job && (
                            <Link href={`/jobs/${e.job.id}`} className="text-ink-soft hover:underline">
                              {jobLabel(e.job)}
                            </Link>
                          )}
                          {fmtTime(e.at) && <p className="text-xs text-ink-faint">{fmtTime(e.at)}</p>}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
