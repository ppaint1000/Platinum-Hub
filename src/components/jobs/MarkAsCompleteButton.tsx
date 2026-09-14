"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";

export function MarkAsCompleteButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function markAsComplete() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("jobs")
      .update({ status: "complete" })
      .eq("id", jobId);
    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <Button onClick={markAsComplete}>
      {saving ? "Marking as complete…" : "Mark as complete"}
    </Button>
  );
}
