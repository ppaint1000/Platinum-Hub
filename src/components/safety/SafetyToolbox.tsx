"use client";

// Health & safety → Toolbox: record a toolbox meeting in a few taps -
// pick a topic from the ideas list (or type one), tap each person who was
// there, add any visitors, and save. Past meetings below, newest first.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Lightbulb, Plus, Search, Shuffle, Users, X } from "lucide-react";
import { deleteToolboxAction, saveToolboxAction, type ToolboxInput } from "@/app/safety/toolbox/actions";
import { TOOLBOX_GROUPS, TOOLBOX_TOPICS, type ToolboxTopic } from "@/lib/safety/toolboxTopics";
import { card, input, primaryBtn, secondaryBtn } from "./styles";

export type ToolboxMeeting = {
  id: string;
  meeting_date: string;
  site_id: string | null;
  location: string | null;
  topic: string;
  topic_key: string | null;
  talking_points: string | null;
  issues: string | null;
  actions: string | null;
  visitors: string[];
  led_by: string | null;
  attendees: string[];
};

type Person = { id: string; full_name: string; role?: string };

const fmt = (key: string, withYear = true) =>
  new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });

const toPoints = (t: ToolboxTopic) => t.points.map((p) => `• ${p}`).join("\n");

const blank = (today: string, userId: string): ToolboxInput => ({
  meetingDate: today,
  siteId: "",
  location: "",
  topic: "",
  topicKey: "",
  talkingPoints: "",
  issues: "",
  actions: "",
  visitors: [],
  ledBy: userId,
  attendees: [],
});

export function SafetyToolbox({
  meetings,
  staff,
  former,
  sites,
  userId,
  today,
}: {
  meetings: ToolboxMeeting[];
  staff: Person[];
  former: Person[];
  sites: { id: string; name: string }[];
  userId: string;
  today: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ToolboxInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    [...staff, ...former].forEach((p) => m.set(p.id, p.full_name));
    return m;
  }, [staff, former]);
  const siteName = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);

  // When each idea was last talked about.
  const lastCovered = useMemo(() => {
    const m = new Map<string, string>();
    for (const mt of meetings) if (mt.topic_key && !m.has(mt.topic_key)) m.set(mt.topic_key, mt.meeting_date);
    return m;
  }, [meetings]);

  const monthKey = today.slice(0, 7);
  const thisMonth = meetings.filter((m) => m.meeting_date.startsWith(monthKey)).length;
  const last = meetings[0];

  function startNew() {
    setError(null);
    setForm(blank(today, userId));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function edit(m: ToolboxMeeting) {
    setError(null);
    setForm({
      id: m.id,
      meetingDate: m.meeting_date.slice(0, 10),
      siteId: m.site_id ?? "",
      location: m.location ?? "",
      topic: m.topic,
      topicKey: m.topic_key ?? "",
      talkingPoints: m.talking_points ?? "",
      issues: m.issues ?? "",
      actions: m.actions ?? "",
      visitors: m.visitors,
      ledBy: m.led_by ?? "",
      attendees: m.attendees,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function save() {
    if (!form) return;
    setError(null);
    start(async () => {
      const r = await saveToolboxAction(form);
      if (r.error) setError(r.error);
      else {
        setForm(null);
        if (r.id) setOpenId(r.id);
        router.refresh();
      }
    });
  }

  function remove(m: ToolboxMeeting) {
    if (!confirm(`Delete the toolbox meeting "${m.topic}" on ${fmt(m.meeting_date)}?`)) return;
    setError(null);
    start(async () => {
      const r = await deleteToolboxAction(m.id);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm text-[#5B6472]">
          <p>Team safety talks - what was covered and who was there.</p>
          <p className="text-xs">
            {thisMonth} this month
            {last ? ` · last one ${fmt(last.meeting_date, false)}: ${last.topic}` : " · none recorded yet"}
          </p>
        </div>
        {!form && (
          <button type="button" onClick={startNew} className={`${primaryBtn} ml-auto`}>
            <Plus className="h-4 w-4" /> New toolbox meeting
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-[#FDECEC] px-3 py-2 text-sm font-semibold text-[#B91C1C]">{error}</p>}

      {form && (
        <MeetingForm
          form={form}
          setForm={setForm}
          staff={staff}
          former={former}
          sites={sites}
          lastCovered={lastCovered}
          pending={pending}
          onSave={save}
          onCancel={() => {
            setForm(null);
            setError(null);
          }}
        />
      )}

      <section className={card}>
        <h2 className="border-b border-[#EFEDE7] px-4 py-3 text-base font-bold">Past meetings</h2>
        {meetings.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[#5B6472]">No toolbox meetings yet. Tap &ldquo;New toolbox meeting&rdquo; to record the first one.</p>
        ) : (
          <ul className="divide-y divide-[#EFEDE7]">
            {meetings.map((m) => {
              const open = openId === m.id;
              const count = m.attendees.length + m.visitors.length;
              const where = (m.site_id && siteName.get(m.site_id)) || m.location;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : m.id)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-[#F8FAFD]"
                  >
                    <span className="w-24 shrink-0 text-xs font-semibold text-[#5B6472]">{fmt(m.meeting_date)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{m.topic}</span>
                      {where && <span className="block truncate text-xs text-[#5B6472]">{where}</span>}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#E3ECF8] px-2.5 py-0.5 text-xs font-semibold text-[#163A69]">
                      <Users className="h-3.5 w-3.5" /> {count}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-[#5B6472] transition ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div className="flex flex-col gap-3 bg-[#FBFAF7] px-4 py-3 text-sm">
                      {m.led_by && names.get(m.led_by) && (
                        <p>
                          <span className="font-semibold">Run by:</span> {names.get(m.led_by)}
                        </p>
                      )}
                      <Detail label="Talked about" text={m.talking_points} />
                      <div>
                        <p className="font-semibold">Who was there ({count})</p>
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {m.attendees
                            .map((id) => names.get(id) ?? "Former staff")
                            .sort()
                            .map((n, i) => (
                              <li key={`${n}-${i}`} className="rounded-full bg-[#E3ECF8] px-2.5 py-0.5 text-xs font-semibold text-[#163A69]">
                                {n}
                              </li>
                            ))}
                          {m.visitors.map((v, i) => (
                            <li key={`v-${v}-${i}`} className="rounded-full bg-[#ECEAE3] px-2.5 py-0.5 text-xs font-semibold text-[#3F4753]">
                              {v} (visitor)
                            </li>
                          ))}
                        </ul>
                      </div>
                      <Detail label="Issues raised" text={m.issues} />
                      <Detail label="Actions agreed" text={m.actions} />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => edit(m)} className={secondaryBtn} disabled={pending}>
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(m)}
                          disabled={pending}
                          className="ml-auto text-xs font-semibold text-[#B91C1C] hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({ label, text }: { label: string; text: string | null }) {
  if (!text) return null;
  return (
    <div>
      <p className="font-semibold">{label}</p>
      <p className="whitespace-pre-wrap text-[#3F4753]">{text}</p>
    </div>
  );
}

function MeetingForm({
  form,
  setForm,
  staff,
  former,
  sites,
  lastCovered,
  pending,
  onSave,
  onCancel,
}: {
  form: ToolboxInput;
  setForm: (f: ToolboxInput) => void;
  staff: Person[];
  former: Person[];
  sites: { id: string; name: string }[];
  lastCovered: Map<string, string>;
  pending: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [showIdeas, setShowIdeas] = useState(!form.id && !form.topic);
  const [group, setGroup] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [visitor, setVisitor] = useState("");
  const set = (patch: Partial<ToolboxInput>) => setForm({ ...form, ...patch });

  // Anyone ticked on an old meeting who's since left still shows, so they
  // can be unticked.
  const people = useMemo(() => {
    const extra = former.filter((p) => form.attendees.includes(p.id));
    return [...staff, ...extra];
  }, [staff, former, form.attendees]);

  const ticked = new Set(form.attendees);
  const shown = people.filter((p) => p.full_name.toLowerCase().includes(search.trim().toLowerCase()));

  function toggle(id: string) {
    set({ attendees: ticked.has(id) ? form.attendees.filter((a) => a !== id) : [...form.attendees, id] });
  }

  function pickTopic(t: ToolboxTopic) {
    set({ topic: t.title, topicKey: t.key, talkingPoints: toPoints(t) });
    setShowIdeas(false);
  }

  // A random idea not talked about in the last six months (or ever).
  function suggest() {
    const cutoff = new Date(`${form.meetingDate}T00:00:00Z`);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 6);
    const cut = cutoff.toISOString().slice(0, 10);
    const fresh = TOOLBOX_TOPICS.filter((t) => (lastCovered.get(t.key) ?? "") < cut);
    const pool = fresh.length ? fresh : TOOLBOX_TOPICS;
    pickTopic(pool[Math.floor(Math.random() * pool.length)]);
  }

  function addVisitor() {
    const v = visitor.trim();
    if (!v) return;
    set({ visitors: [...form.visitors, v] });
    setVisitor("");
  }

  const ideas = TOOLBOX_TOPICS.filter((t) => group === "All" || t.group === group);
  const total = form.attendees.length + form.visitors.length;

  return (
    <section className={`${card} flex flex-col gap-5 p-4`}>
      <h2 className="text-lg font-bold">{form.id ? "Edit toolbox meeting" : "New toolbox meeting"}</h2>

      {/* 1. When and where */}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Date</span>
          <input type="date" className={input} value={form.meetingDate} onChange={(e) => set({ meetingDate: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Site</span>
          <select className={input} value={form.siteId} onChange={(e) => set({ siteId: e.target.value })}>
            <option value="">Office / other place</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Run by</span>
          <select className={input} value={form.ledBy} onChange={(e) => set({ ledBy: e.target.value })}>
            <option value="">—</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        {!form.siteId && (
          <label className="flex flex-col gap-1 text-sm sm:col-span-3">
            <span className="font-semibold">Where (optional)</span>
            <input className={input} placeholder="e.g. Office, yard" value={form.location} onChange={(e) => set({ location: e.target.value })} />
          </label>
        )}
      </div>

      {/* 2. Topic */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="font-semibold">Topic</span>
            <input
              className={input}
              placeholder="Pick an idea below or type your own"
              value={form.topic}
              onChange={(e) => set({ topic: e.target.value, topicKey: "" })}
            />
          </label>
          <button type="button" onClick={() => setShowIdeas((v) => !v)} className={secondaryBtn} aria-expanded={showIdeas}>
            <Lightbulb className="h-4 w-4" /> {showIdeas ? "Hide ideas" : "Topic ideas"}
          </button>
          <button type="button" onClick={suggest} className={secondaryBtn} title="Pick one we haven't covered lately">
            <Shuffle className="h-4 w-4" /> Suggest one
          </button>
        </div>

        {showIdeas && (
          <div className="rounded-lg border border-[#E3E1DA] bg-[#FBFAF7] p-3">
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              {["All", ...TOOLBOX_GROUPS].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroup(g)}
                  aria-pressed={group === g}
                  className={`flex-none whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${
                    group === g ? "border-[#16202E] bg-[#16202E] text-white" : "border-[#D9D6CC] bg-white text-[#16202E]"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
            <ul className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
              {ideas.map((t) => {
                const chosen = form.topicKey === t.key;
                const lastOn = lastCovered.get(t.key);
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      onClick={() => pickTopic(t)}
                      aria-pressed={chosen}
                      className={`flex h-full w-full flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-sm ${
                        chosen ? "border-[#1F4E8C] bg-[#E3ECF8]" : "border-[#E3E1DA] bg-white hover:border-[#1F4E8C]"
                      }`}
                    >
                      <span className="font-semibold">{t.title}</span>
                      <span className="text-xs text-[#5B6472]">
                        {t.group}
                        {lastOn ? ` · last covered ${fmt(lastOn, false)}` : " · not covered yet"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">What was talked about</span>
          <textarea
            className={input}
            rows={5}
            placeholder="Talking points - filled in when you pick an idea, change as needed"
            value={form.talkingPoints}
            onChange={(e) => set({ talkingPoints: e.target.value })}
          />
        </label>
      </div>

      {/* 3. Attendance */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">
            Who was there <span className="ml-1 rounded-full bg-[#1F4E8C] px-2 py-0.5 text-xs text-white">{total}</span>
          </p>
          <div className="ml-auto flex gap-2">
            <button type="button" className={secondaryBtn} onClick={() => set({ attendees: people.map((p) => p.id) })}>
              Tick everyone
            </button>
            <button type="button" className={secondaryBtn} onClick={() => set({ attendees: [] })} disabled={!form.attendees.length}>
              Clear
            </button>
          </div>
        </div>
        {people.length > 10 && (
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A919C]" />
            <input className={`${input} pl-9`} placeholder="Find a name" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
        )}
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => {
            const on = ticked.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(p.id)}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-lg border-2 px-3 py-2 text-left text-sm font-semibold transition ${
                    on ? "border-[#1F7A3F] bg-[#E7F4EC] text-[#14532D]" : "border-[#E3E1DA] bg-white text-[#16202E] hover:border-[#9CA3AF]"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 flex-none items-center justify-center rounded-md border-2 ${
                      on ? "border-[#1F7A3F] bg-[#1F7A3F] text-white" : "border-[#B8B4A8] bg-white"
                    }`}
                  >
                    {on && <Check className="h-4 w-4" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{p.full_name}</span>
                  {(p.role === "supervisor" || p.role === "admin") && (
                    <span className="flex-none rounded-full bg-[#ECEAE3] px-2 py-0.5 text-[11px] font-semibold capitalize text-[#3F4753]">{p.role}</span>
                  )}
                </button>
              </li>
            );
          })}
          {!shown.length && <li className="text-sm text-[#5B6472]">No one matches &ldquo;{search}&rdquo;.</li>}
        </ul>

        <div className="flex flex-col gap-1.5 text-sm">
          <span className="font-semibold">Visitors / subbies (not on the staff list)</span>
          <div className="flex gap-2">
            <input
              className={input}
              placeholder="Name"
              value={visitor}
              onChange={(e) => setVisitor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addVisitor();
                }
              }}
            />
            <button type="button" className={secondaryBtn} onClick={addVisitor}>
              Add
            </button>
          </div>
          {form.visitors.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {form.visitors.map((v, i) => (
                <li key={`${v}-${i}`} className="flex items-center gap-1 rounded-full bg-[#ECEAE3] py-1 pl-3 pr-1 font-semibold text-[#3F4753]">
                  {v}
                  <button
                    type="button"
                    aria-label={`Remove ${v}`}
                    onClick={() => set({ visitors: form.visitors.filter((_, j) => j !== i) })}
                    className="rounded-full p-1 hover:bg-white/60"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 4. Outcomes */}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Issues raised by the team</span>
          <textarea className={input} rows={3} value={form.issues} onChange={(e) => set({ issues: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Actions agreed</span>
          <textarea className={input} rows={3} value={form.actions} onChange={(e) => set({ actions: e.target.value })} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onSave} disabled={pending} className={primaryBtn}>
          {pending ? "Saving…" : form.id ? "Save changes" : "Save meeting"}
        </button>
        <button type="button" onClick={onCancel} disabled={pending} className={secondaryBtn}>
          Cancel
        </button>
      </div>
    </section>
  );
}
