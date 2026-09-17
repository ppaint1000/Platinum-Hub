"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { LostToField } from "./LostToField";

type Step = "closed" | "ask" | "who";

export function MarkAsLostButton({ jobId, lostToOptions }: { jobId: string; lostToOptions: string[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [lostTo, setLostTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(lostToValue: string | null) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("jobs")
      .update({
        status: "lost",
        lost_at: new Date().toISOString().slice(0, 10),
        lost_to: lostToValue,
      })
      .eq("id", jobId);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setStep("closed");
    router.refresh();
  }

  function confirmWho(e: React.FormEvent) {
    e.preventDefault();
    if (!lostTo.trim()) {
      setError("Enter who it was lost to, or go back and choose “No”.");
      return;
    }
    save(lostTo.trim());
  }

  if (step === "closed") {
    return (
      <Button
        variant="secondary"
        onClick={() => {
          setLostTo("");
          setError(null);
          setStep("ask");
        }}
      >
        Mark as lost
      </Button>
    );
  }

  if (step === "ask") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2 whitespace-nowrap rounded border border-line bg-paper-raised px-3 py-2">
          <span className="text-sm text-ink">Do you know who you lost it to?</span>
          <Button onClick={() => setStep("who")} disabled={saving}>
            Yes
          </Button>
          <Button variant="secondary" onClick={() => save(null)} disabled={saving}>
            {saving ? "Saving…" : "No"}
          </Button>
          <Button variant="secondary" onClick={() => setStep("closed")} disabled={saving}>
            Cancel
          </Button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={confirmWho} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <LostToField value={lostTo} onChange={setLostTo} options={lostToOptions} autoFocus />
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Confirm"}
        </Button>
        <Button variant="secondary" onClick={() => setStep("ask")} disabled={saving}>
          Back
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
