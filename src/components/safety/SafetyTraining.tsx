"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  approveTrainingAction,
  certificateLinkAction,
  deleteCourseAction,
  deleteTrainingAction,
  saveCourseAction,
  saveTrainingAction,
  setCourseActiveAction,
} from "@/app/safety/training/actions";
import {
  currentRecords,
  expiryFor,
  expiryState,
  fmtDay,
  OUTCOMES,
  TRAINING_WARN_DAYS,
  type ExpiryState,
  type Outcome,
  type TrainingCourse,
  type TrainingRecord,
} from "@/lib/safety/trainingShared";
import { card, input, primaryBtn, secondaryBtn } from "./styles";

type Person = { id: string; full_name: string };

type CellState = ExpiryState | "none" | "to_complete" | "not_required";
const CELL: Record<CellState, string> = {
  ok: "border-[#B7E1C4] bg-[#EAF7EE] text-[#166534]",
  due: "border-[#F2C94C] bg-[#FFF8E1] text-[#8A6100]",
  expired: "border-[#F5B5B5] bg-[#FDECEC] text-[#B91C1C]",
  to_complete: "border-[#BFD3EE] bg-[#EEF4FC] text-[#1F4E8C]",
  not_required: "border-dashed border-[#D9D6CC] bg-[#F5F4F0] text-[#7A828F]",
  none: "border-[#E3E1DA] bg-white text-[#9AA1AC]",
};

const cellState = (r: TrainingRecord | undefined, today: string): CellState =>
  !r
    ? "none"
    : r.outcome === "done"
      ? expiryState(r.expires_on, today)
      : r.outcome;

// "Done 16 Oct 2024", "Done in house", "To complete", "Not required".
function describeRecord(r: TrainingRecord): string {
  if (r.outcome === "to_complete")
    return r.notes === "TBC" ? "To complete (TBC)" : "To complete";
  if (r.outcome === "not_required") return "Not required";
  if (r.completed_on) return `Done ${fmtDay(r.completed_on)}`;
  return r.provider
    ? `Done - ${r.provider.toLowerCase() === "in house" ? "in house" : r.provider}`
    : "Done";
}

type Draft = {
  id?: string;
  userId: string;
  courseId: string;
  outcome: Outcome;
  completedOn: string;
  expiresOn: string;
  expiryTouched: boolean;
  provider: string;
  notes: string;
  hasCertificate: boolean;
};

export function SafetyTraining({
  courses,
  records,
  staff,
  isManager,
  userId,
  today,
}: {
  courses: TrainingCourse[];
  records: TrainingRecord[];
  staff: Person[];
  isManager: boolean;
  userId: string;
  today: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [filterPerson, setFilterPerson] = useState("");
  const [filterCourse, setFilterCourse] = useState("");

  const active = courses.filter((c) => c.is_active);
  const courseById = useMemo(
    () => new Map(courses.map((c) => [c.id, c])),
    [courses],
  );
  const personById = useMemo(
    () => new Map(staff.map((p) => [p.id, p.full_name])),
    [staff],
  );
  const current = useMemo(() => currentRecords(records), [records]);
  const pendingRecords = records.filter((r) => r.status === "pending");
  const counts = useMemo(() => {
    let due = 0;
    let expired = 0;
    let toComplete = 0;
    for (const r of current.values()) {
      if (!personById.has(r.user_id)) continue;
      const s = cellState(r, today);
      if (s === "due") due++;
      if (s === "expired") expired++;
      if (s === "to_complete") toComplete++;
    }
    return { due, expired, toComplete };
  }, [current, personById, today]);

  function openNew(personId: string, courseId: string) {
    const course = courseById.get(courseId);
    setError(null);
    setDraft({
      userId: isManager ? personId : userId,
      courseId,
      outcome: "done",
      completedOn: today,
      expiresOn: expiryFor(today, course?.valid_months ?? null) ?? "",
      expiryTouched: false,
      provider: "",
      notes: "",
      hasCertificate: false,
    });
    requestAnimationFrame(() =>
      document
        .getElementById("training-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function openEdit(r: TrainingRecord) {
    setError(null);
    setDraft({
      id: r.id,
      userId: r.user_id,
      courseId: r.course_id,
      outcome: r.outcome,
      completedOn: r.completed_on ?? "",
      expiresOn: r.expires_on ?? "",
      expiryTouched: true,
      provider: r.provider ?? "",
      notes: r.notes ?? "",
      hasCertificate: Boolean(r.certificate_path),
    });
    requestAnimationFrame(() =>
      document
        .getElementById("training-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  function openCertificate(id: string) {
    start(async () => {
      const r = await certificateLinkAction(id);
      if (r.url) window.open(r.url, "_blank", "noopener");
      else setError(r.error ?? "Couldn't open it.");
    });
  }

  const shown = records.filter(
    (r) =>
      personById.has(r.user_id) &&
      (!filterPerson || r.user_id === filterPerson) &&
      (!filterCourse || r.course_id === filterCourse),
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[#5B6472]">
        {isManager
          ? `Everyone on timesheets against each training. Green = done, amber = expires within ${TRAINING_WARN_DAYS} days, red = expired, blue = to complete, grey = not required. Click a square to add or change it.`
          : "Your training records. Add a photo of a new certificate and a manager will check it."}
      </p>

      {isManager &&
        (counts.due > 0 || counts.expired > 0 || counts.toComplete > 0) && (
          <div className="flex flex-wrap gap-2 text-sm">
            {counts.expired > 0 && (
              <span
                className={`rounded-full border px-3 py-1 font-semibold ${CELL.expired}`}
              >
                {counts.expired} expired
              </span>
            )}
            {counts.due > 0 && (
              <span
                className={`rounded-full border px-3 py-1 font-semibold ${CELL.due}`}
              >
                {counts.due} expiring soon
              </span>
            )}
            {counts.toComplete > 0 && (
              <span
                className={`rounded-full border px-3 py-1 font-semibold ${CELL.to_complete}`}
              >
                {counts.toComplete} to complete
              </span>
            )}
          </div>
        )}

      {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}

      {isManager && pendingRecords.length > 0 && (
        <div className={`${card} border-[#F2C94C] p-4`}>
          <h2 className="mb-2 text-base font-bold">Waiting for approval</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {pendingRecords.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                <span className="font-semibold">
                  {personById.get(r.user_id) ?? "Someone"}
                </span>
                <span>{courseById.get(r.course_id)?.name ?? "Training"}</span>
                <span className="text-[#5B6472]">
                  {describeRecord(r)}
                  {r.expires_on ? `, expires ${fmtDay(r.expires_on)}` : ""}
                </span>
                {r.certificate_path && (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => openCertificate(r.id)}
                  >
                    Certificate
                  </button>
                )}
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    className={primaryBtn}
                    disabled={pending}
                    onClick={() => run(() => approveTrainingAction(r.id))}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className={secondaryBtn}
                    onClick={() => openEdit(r)}
                  >
                    Edit
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The matrix: people down the side, training across the top. */}
      <div className={`${card} overflow-x-auto p-3`}>
        {active.length === 0 ? (
          <p className="p-2 text-sm text-[#5B6472]">
            No training set up yet
            {isManager ? " - add some under Training types below." : "."}
          </p>
        ) : (
          <table className="w-full border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white px-2 py-1 text-left text-xs uppercase tracking-wide text-[#5B6472]">
                  Person
                </th>
                {active.map((c) => (
                  <th
                    key={c.id}
                    className="min-w-[120px] px-2 py-1 text-left text-xs font-semibold text-[#16202E]"
                  >
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((p) => (
                <tr key={p.id}>
                  <td className="sticky left-0 whitespace-nowrap bg-white px-2 py-1 font-semibold">
                    {p.full_name}
                  </td>
                  {active.map((c) => {
                    const r = current.get(`${p.id}:${c.id}`);
                    const waiting = records.some(
                      (x) =>
                        x.status === "pending" &&
                        x.user_id === p.id &&
                        x.course_id === c.id,
                    );
                    const state = cellState(r, today);
                    return (
                      <td key={c.id} className="p-0">
                        <button
                          type="button"
                          onClick={() =>
                            r && isManager ? openEdit(r) : openNew(p.id, c.id)
                          }
                          className={`flex w-full flex-col rounded-lg border px-2 py-1.5 text-left text-xs ${CELL[state]} hover:brightness-95`}
                        >
                          {r ? (
                            r.outcome === "done" ? (
                              <>
                                <span className="font-semibold">
                                  {state === "expired"
                                    ? "Expired"
                                    : state === "due"
                                      ? "Expiring"
                                      : "✓ Done"}
                                </span>
                                <span>
                                  {r.expires_on
                                    ? fmtDay(r.expires_on)
                                    : r.completed_on
                                      ? fmtDay(r.completed_on)
                                      : (r.provider ?? "")}
                                </span>
                              </>
                            ) : (
                              <span className="py-1.5 font-semibold">
                                {describeRecord(r)}
                              </span>
                            )
                          ) : (
                            <span className="py-1.5">
                              {waiting ? "Waiting approval" : "—"}
                            </span>
                          )}
                          {r && waiting && (
                            <span className="text-[#8A6100]">
                              New one waiting
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryBtn}
          onClick={() => openNew(isManager ? "" : userId, active[0]?.id ?? "")}
          disabled={!active.length}
        >
          <Plus className="h-4 w-4" />{" "}
          {isManager ? "Add training" : "Add a certificate"}
        </button>
      </div>

      {draft && (
        <TrainingForm
          key={draft.id ?? `${draft.userId}:${draft.courseId}`}
          draft={draft}
          courses={active.concat(
            courses.filter((c) => !c.is_active && c.id === draft.courseId),
          )}
          staff={staff}
          isManager={isManager}
          userId={userId}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            router.refresh();
          }}
          onDelete={
            draft.id
              ? () => {
                  if (!confirm("Delete this training record?")) return;
                  run(async () => {
                    const r = await deleteTrainingAction(draft.id!);
                    if (!r.error) setDraft(null);
                    return r;
                  });
                }
              : undefined
          }
        />
      )}

      {/* Every record, newest first. */}
      <div className={`${card} p-4`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-base font-bold">
            {isManager ? "All training records" : "My training"}
          </h2>
          {isManager && (
            <select
              className={`${input} w-auto`}
              value={filterPerson}
              onChange={(e) => setFilterPerson(e.target.value)}
            >
              <option value="">Everyone</option>
              {staff.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          )}
          <select
            className={`${input} w-auto`}
            value={filterCourse}
            onChange={(e) => setFilterCourse(e.target.value)}
          >
            <option value="">All training</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-[#5B6472]">No training records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[#5B6472]">
                <tr>
                  {isManager && <th className="py-2 pr-3">Person</th>}
                  <th className="py-2 pr-3">Training</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Expires</th>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3">Certificate</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const state = cellState(r, today);
                  const isCurrent =
                    current.get(`${r.user_id}:${r.course_id}`)?.id === r.id;
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-[#E3E1DA] align-top"
                    >
                      {isManager && (
                        <td className="py-2 pr-3 font-semibold">
                          {personById.get(r.user_id)}
                        </td>
                      )}
                      <td className="py-2 pr-3">
                        {courseById.get(r.course_id)?.name ?? "Training"}
                        {r.status === "pending" && (
                          <span
                            className={`ml-2 rounded-full border px-2 py-0.5 text-xs font-semibold ${CELL.due}`}
                          >
                            Waiting approval
                          </span>
                        )}
                        {r.status === "approved" && !isCurrent && (
                          <span className="ml-2 text-xs text-[#9AA1AC]">
                            (older)
                          </span>
                        )}
                        {r.notes && (
                          <span className="block text-xs text-[#5B6472]">
                            {r.notes}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {describeRecord(r)}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {r.outcome !== "done" ? null : r.expires_on ? (
                          <span
                            className={
                              isCurrent &&
                              (state === "due" || state === "expired")
                                ? `rounded px-1.5 py-0.5 font-semibold ${CELL[state]}`
                                : ""
                            }
                          >
                            {fmtDay(r.expires_on)}
                          </span>
                        ) : (
                          <span className="text-[#9AA1AC]">
                            Doesn&apos;t expire
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">{r.provider ?? ""}</td>
                      <td className="py-2 pr-3">
                        {r.certificate_path ? (
                          <button
                            type="button"
                            onClick={() => openCertificate(r.id)}
                            className="inline-flex items-center gap-1 underline"
                          >
                            <FileText className="h-4 w-4" /> View
                          </button>
                        ) : (
                          <span className="text-[#9AA1AC]">None</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {isManager ? (
                          <button
                            type="button"
                            className="underline"
                            onClick={() => openEdit(r)}
                          >
                            Edit
                          </button>
                        ) : (
                          r.status === "pending" && (
                            <button
                              type="button"
                              className="text-[#B91C1C] underline"
                              onClick={() =>
                                confirm("Delete this certificate?") &&
                                run(() => deleteTrainingAction(r.id))
                              }
                            >
                              Delete
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isManager && <CourseList courses={courses} />}
    </div>
  );
}

function TrainingForm({
  draft: initial,
  courses,
  staff,
  isManager,
  userId,
  onClose,
  onSaved,
  onDelete,
}: {
  draft: Draft;
  courses: TrainingCourse[];
  staff: Person[];
  isManager: boolean;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
}) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const course = courses.find((c) => c.id === d.courseId);

  // The expiry follows the course's length until it's typed over.
  function update(patch: Partial<Draft>) {
    setD((old) => {
      const next = { ...old, ...patch };
      if (
        !next.expiryTouched &&
        ("completedOn" in patch || "courseId" in patch)
      ) {
        const c = courses.find((x) => x.id === next.courseId);
        next.expiresOn =
          expiryFor(next.completedOn, c?.valid_months ?? null) ?? "";
      }
      return next;
    });
  }

  async function save() {
    setError(null);
    const who = isManager ? d.userId : userId;
    if (!who) return setError("Pick the person.");
    if (!d.courseId) return setError("Pick the training.");
    const file = fileRef.current?.files?.[0];
    const done = d.outcome === "done";
    if (!isManager && !file && !d.id)
      return setError("Add a photo or PDF of the certificate.");
    setBusy(true);
    let path: string | null = null;
    if (file && done) {
      if (file.size > 20 * 1024 * 1024) {
        setBusy(false);
        return setError("That file is over 20 MB.");
      }
      path = `${who}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error: upErr } = await createClient()
        .storage.from("training-certificates")
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) {
        setBusy(false);
        return setError(upErr.message);
      }
    }
    const r = await saveTrainingAction({
      id: d.id,
      userId: who,
      courseId: d.courseId,
      outcome: isManager ? d.outcome : "done",
      completedOn: d.completedOn,
      expiresOn: d.expiresOn,
      provider: d.provider,
      notes: d.notes,
      certificatePath: path,
    });
    setBusy(false);
    if (r.error) return setError(r.error);
    onSaved();
  }

  return (
    <div
      id="training-form"
      className={`${card} flex flex-col gap-3 border-[#1F4E8C] p-4`}
    >
      <h2 className="text-base font-bold">
        {d.id
          ? "Edit training"
          : isManager
            ? "Add training"
            : "Add a certificate"}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {isManager && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Person</span>
            <select
              className={input}
              value={d.userId}
              onChange={(e) => update({ userId: e.target.value })}
              disabled={Boolean(d.id)}
            >
              <option value="">Choose…</option>
              {staff.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Training</span>
          <select
            className={input}
            value={d.courseId}
            onChange={(e) => update({ courseId: e.target.value })}
          >
            <option value="">Choose…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {isManager && (
          <div className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">Status</span>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => update({ outcome: o.value })}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold ${d.outcome === o.value ? "border-[#16202E] bg-[#16202E] text-white" : "border-[#D9D6CC] bg-white"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {d.outcome === "done" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Date done</span>
              <input
                type="date"
                className={input}
                value={d.completedOn}
                onChange={(e) => update({ completedOn: e.target.value })}
              />
              <span className="text-xs text-[#5B6472]">
                Can be left blank for in-house training.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => update({ provider: "In house" })}
                >
                  Mark as in house
                </button>
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Expires</span>
              <input
                type="date"
                className={input}
                value={d.expiresOn}
                onChange={(e) =>
                  update({ expiresOn: e.target.value, expiryTouched: true })
                }
              />
              <span className="text-xs text-[#5B6472]">
                {course?.valid_months
                  ? `Filled in from ${course.name} lasting ${course.valid_months} months - change it if the certificate says otherwise.`
                  : "Leave blank if it doesn't expire."}
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold">Provider (optional)</span>
              <input
                className={input}
                value={d.provider}
                onChange={(e) => update({ provider: e.target.value })}
                placeholder="e.g. Site Safe, In house"
              />
            </label>
          </>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Notes (optional)</span>
          <input
            className={input}
            value={d.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </label>
        {d.outcome === "done" && (
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">
              Certificate - photo or PDF
              {d.hasCertificate
                ? " (choose a file only to replace the one saved)"
                : isManager
                  ? " (optional)"
                  : ""}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="text-sm"
            />
          </label>
        )}
      </div>
      {!isManager && (
        <p className="text-xs text-[#5B6472]">
          A manager will check it before it shows as done.
        </p>
      )}
      {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryBtn}
          onClick={save}
          disabled={busy}
        >
          <Upload className="h-4 w-4" /> {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={secondaryBtn}
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        {onDelete && (
          <button
            type="button"
            className={`${secondaryBtn} ml-auto text-[#B91C1C]`}
            onClick={onDelete}
            disabled={busy}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// The training names (and how long each lasts) - managers add more here.
function CourseList({ courses }: { courses: TrainingCourse[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [months, setMonths] = useState("");
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    months: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.error) return setError(r.error);
      after?.();
      router.refresh();
    });
  }

  return (
    <div className={`${card} p-4`}>
      <h2 className="mb-1 text-base font-bold">Training types</h2>
      <p className="mb-3 text-sm text-[#5B6472]">
        The columns in the matrix. &ldquo;Lasts&rdquo; fills in the expiry when
        training is added - leave it blank if it doesn&apos;t expire.
      </p>
      <ul className="mb-3 flex flex-col divide-y divide-[#E3E1DA] text-sm">
        {courses.map((c) =>
          editing?.id === c.id ? (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
              <input
                className={`${input} w-56`}
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
              <input
                className={`${input} w-24`}
                inputMode="numeric"
                value={editing.months}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    months: e.target.value.replace(/\D/g, ""),
                  })
                }
                placeholder="months"
              />
              <span className="text-[#5B6472]">months</span>
              <button
                type="button"
                className={primaryBtn}
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      saveCourseAction({
                        id: c.id,
                        name: editing.name,
                        validMonths: editing.months
                          ? Number(editing.months)
                          : null,
                      }),
                    () => setEditing(null),
                  )
                }
              >
                Save
              </button>
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </li>
          ) : (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
              <span
                className={`font-semibold ${c.is_active ? "" : "text-[#9AA1AC] line-through"}`}
              >
                {c.name}
              </span>
              <span className="text-[#5B6472]">
                {c.valid_months
                  ? `Lasts ${c.valid_months} months`
                  : "Doesn't expire"}
              </span>
              <span className="ml-auto flex gap-3">
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    setEditing({
                      id: c.id,
                      name: c.name,
                      months: c.valid_months ? String(c.valid_months) : "",
                    })
                  }
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="underline"
                  disabled={pending}
                  onClick={() =>
                    run(() => setCourseActiveAction(c.id, !c.is_active))
                  }
                >
                  {c.is_active ? "Hide" : "Show"}
                </button>
                <button
                  type="button"
                  className="text-[#B91C1C] underline"
                  disabled={pending}
                  onClick={() =>
                    confirm(
                      `Delete "${c.name}" and everyone's records of it? This can't be undone - use Hide to keep the records.`,
                    ) && run(() => deleteCourseAction(c.id))
                  }
                >
                  Delete
                </button>
              </span>
            </li>
          ),
        )}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">New training</span>
          <input
            className={`${input} w-56`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. First aid"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">Lasts (months)</span>
          <input
            className={`${input} w-28`}
            inputMode="numeric"
            value={months}
            onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))}
            placeholder="optional"
          />
        </label>
        <button
          type="button"
          className={primaryBtn}
          disabled={pending || !name.trim()}
          onClick={() =>
            run(
              () =>
                saveCourseAction({
                  name,
                  validMonths: months ? Number(months) : null,
                }),
              () => {
                setName("");
                setMonths("");
              },
            )
          }
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm font-semibold text-[#B91C1C]">{error}</p>
      )}
    </div>
  );
}
