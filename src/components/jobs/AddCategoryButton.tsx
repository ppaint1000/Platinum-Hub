"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { addJobCategoryAction } from "@/app/jobs/actions";

export function AddCategoryButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const result = await addJobCategoryAction(jobId, label);

    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setLabel("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add category
      </Button>
    );
  }

  return (
    <form onSubmit={save} className="mt-2 flex items-center gap-2">
      <input
        required
        autoFocus
        placeholder="Category name"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="rounded border border-line px-2 py-1.5 text-sm"
      />
      <Button type="submit" disabled={saving}>
        {saving ? "Adding…" : "Add"}
      </Button>
      <Button variant="secondary" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      {error && (
        <p className="text-sm" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}
    </form>
  );
}
