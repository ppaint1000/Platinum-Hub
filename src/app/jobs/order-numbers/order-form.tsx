"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addOrderNumberAction, removeOrderNumberAction } from "./actions";

const field = "min-h-11 w-full rounded-lg border border-line bg-white px-3 text-base";

export function OrderNumberForm({ jobOptions }: { jobOptions: { id: string; label: string }[] }) {
  const router = useRouter();
  const [orderNumber, setOrderNumber] = useState("");
  const [jobId, setJobId] = useState("");
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const r = await addOrderNumberAction(orderNumber, jobId);
          if (r.error) return setMessage({ text: r.error, bad: true });
          setMessage({ text: `Order ${orderNumber.trim()} logged.` });
          setOrderNumber("");
          router.refresh();
        });
      }}
      className="flex flex-col gap-4 rounded-lg border border-line bg-paper-raised p-5"
    >
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Order number (from the order book)
        <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} inputMode="numeric" autoFocus className={field} placeholder="e.g. 4127" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Job
        <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={field}>
          <option value="">Choose the job…</option>
          {jobOptions.map((j) => (
            <option key={j.id} value={j.id}>
              {j.label}
            </option>
          ))}
        </select>
      </label>
      <button disabled={pending} className="min-h-11 rounded-lg bg-ink px-4 font-semibold text-white disabled:opacity-50">
        {pending ? "Saving…" : "Log order"}
      </button>
      {message && <p className={`text-sm font-medium ${message.bad ? "text-red-700" : "text-green-700"}`}>{message.text}</p>}
    </form>
  );
}

export function RemoveOrderNumber({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        confirm("Remove this order number?") &&
        startTransition(async () => {
          await removeOrderNumberAction(id);
          router.refresh();
        })
      }
      className="text-xs text-ink-soft hover:text-red-700"
    >
      Remove
    </button>
  );
}
