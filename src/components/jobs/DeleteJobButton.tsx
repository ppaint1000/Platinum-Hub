"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "@/components/orders/ConfirmDialog";
import { deleteJobAction } from "@/app/jobs/actions";

// For a job that was entered by mistake - available at every status, since
// a wrong job can be caught after it's been marked won or started too.
export function DeleteJobButton({
  jobId,
  jobName,
  costLineCount,
}: {
  jobId: string;
  jobName: string;
  costLineCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteJobAction(jobId);
    if (result.error) {
      setDeleting(false);
      setError(result.error);
      return;
    }
    router.push("/jobs");
    router.refresh();
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Delete job
      </Button>
      {open && (
        <ConfirmDialog
          title="Delete this job?"
          message={`“${jobName}” will be permanently deleted, along with its budget${
            costLineCount > 0 ? ` and its ${costLineCount} recorded cost line${costLineCount === 1 ? "" : "s"}` : ""
          }. It will also drop out of the Sales page totals. This can’t be undone.`}
          confirmLabel="Delete job"
          confirmingLabel="Deleting…"
          confirming={deleting}
          error={error}
          onConfirm={confirmDelete}
          onCancel={() => {
            if (deleting) return;
            setOpen(false);
            setError(null);
          }}
        />
      )}
    </>
  );
}
