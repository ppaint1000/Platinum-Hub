"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export function MarkAsInProgressButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function markAsInProgress() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("jobs")
      .update({ status: "in_progress" })
      .eq("id", jobId);
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <Button onClick={markAsInProgress}>
      {saving ? "Marking as in progress…" : "Mark as in progress"}
    </Button>
  );
}
