"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export function MarkAsLostButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lostTo, setLostTo] = useState("");
  const [saving, setSaving] = useState(false);

  async function markAsLost(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("jobs")
      .update({ status: "lost", lost_at: new Date().toISOString().slice(0, 10), lost_to: lostTo })
      .eq("id", jobId);
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Mark as lost
      </Button>
    );
  }

  return (
    <form onSubmit={markAsLost} className="flex items-center gap-2">
      <input
        required
        autoFocus
        value={lostTo}
        onChange={(e) => setLostTo(e.target.value)}
        placeholder="Lost to…"
        className="rounded border border-line px-2 py-1.5 text-sm"
      />
      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Confirm"}
      </Button>
      <Button variant="secondary" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
