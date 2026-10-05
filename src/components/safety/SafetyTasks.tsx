"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addTaskAction, deleteTaskAction, setTaskDoneAction } from "@/app/safety/actions";
import { card, input, primaryBtn, secondaryBtn } from "./styles";

export type TaskRow = {
  id: string;
  title: string;
  details: string | null;
  due_on: string | null;
  status: "open" | "done";
  done_at: string | null;
  assignee: { full_name: string } | null;
  site: { name: string } | null;
};

const fmt = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-NZ", { day: "numeric", month: "short", timeZone: "UTC" });

export function SafetyTasks({
  rows,
  staff,
  sites,
  canManage,
  today,
}: {
  rows: TaskRow[];
  staff: { id: string; full_name: string }[];
  sites: { id: string; name: string }[];
  canManage: boolean;
  today: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: "", details: "", assignedTo: "", siteId: "", dueOn: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [showDone, setShowDone] = useState(false);
  const open = rows.filter((r) => r.status === "open");
  const done = rows.filter((r) => r.status === "done");

  function act(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  const list = (items: TaskRow[]) => (
    <ul className="divide-y divide-[#EFEDE7]">
      {items.map((t) => {
        const overdue = t.status === "open" && t.due_on && t.due_on < today;
        return (
          <li key={t.id} className="flex items-start gap-3 px-4 py-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={t.status === "done"}
              disabled={pending}
              onChange={(e) => act(() => setTaskDoneAction(t.id, e.target.checked))}
              aria-label={`Mark "${t.title}" ${t.status === "done" ? "not done" : "done"}`}
            />
            <span className="min-w-0 flex-1">
              <span className={`font-semibold ${t.status === "done" ? "text-[#8A919C] line-through" : ""}`}>{t.title}</span>
              {t.details && <span className="block whitespace-pre-wrap text-[#5B6472]">{t.details}</span>}
              <span className="block text-xs text-[#5B6472]">
                {[t.assignee?.full_name ? `For ${t.assignee.full_name}` : "Not given to anyone", t.site?.name].filter(Boolean).join(" · ")}
              </span>
            </span>
            {t.due_on && (
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${overdue ? "bg-[#B91C1C] text-white" : "bg-[#ECEAE3] text-[#3F4753]"}`}>
                {overdue ? "Overdue " : "Due "}
                {fmt(t.due_on)}
              </span>
            )}
            {canManage && (
              <button
                type="button"
                onClick={() => confirm("Delete this task?") && act(() => deleteTaskAction(t.id))}
                className="shrink-0 text-xs font-semibold text-[#B91C1C] hover:underline"
              >
                Delete
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-[#5B6472]">{canManage ? "Safety jobs to do across the sites." : "Safety jobs given to you, or that you've added."}</p>
        <button type="button" onClick={() => setAdding((v) => !v)} className={`${primaryBtn} ml-auto`}>
          <Plus className="h-4 w-4" /> New task
        </button>
      </div>

      {adding && (
        <div className={`${card} grid gap-3 p-4 sm:grid-cols-2`}>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">What needs doing</span>
            <input className={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">Details</span>
            <textarea className={input} rows={2} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Give it to</span>
            <select className={input} value={f.assignedTo} onChange={(e) => setF({ ...f, assignedTo: e.target.value })}>
              <option value="">Nobody yet</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">Due</span>
            <input type="date" className={input} value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">Site</span>
            <select className={input} value={f.siteId} onChange={(e) => setF({ ...f, siteId: e.target.value })}>
              <option value="">Not a site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                act(
                  () => addTaskAction(f),
                  () => {
                    setAdding(false);
                    setF({ title: "", details: "", assignedTo: "", siteId: "", dueOn: "" });
                  }
                )
              }
              className={primaryBtn}
            >
              {pending ? "Saving…" : "Add task"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className={secondaryBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm font-semibold text-[#B91C1C]">{error}</p>}

      <div className={card}>{open.length ? list(open) : <p className="p-6 text-sm text-[#5B6472]">Nothing to do.</p>}</div>
      {done.length > 0 && (
        <>
          <button type="button" onClick={() => setShowDone((v) => !v)} className="self-start text-sm font-semibold text-[#1F4E8C] hover:underline">
            {showDone ? "Hide" : "Show"} completed ({done.length})
          </button>
          {showDone && <div className={card}>{list(done)}</div>}
        </>
      )}
    </div>
  );
}
