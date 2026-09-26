"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";
import { assignSalesPersonAction } from "@/app/jobs/actions";

// Shown on a job brought across into the Hub that has no sales
// person yet - until one is picked, its quoted/won $ is missing from the
// Sales page entirely (see needsSalesPerson in lib/jobs/salesTeam.ts).
export function AssignSalesPersonBanner({
  jobId,
  salesTeam,
}: {
  jobId: string;
  salesTeam: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [leadByUserId, setLeadByUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign() {
    setSaving(true);
    setError(null);
    const result = await assignSalesPersonAction(jobId, leadByUserId);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="mb-3 flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p>
          <span className="font-semibold">Needs a sales person.</span> This job was brought across into the
          Hub without one, so it isn&apos;t counted on the Sales page yet.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={leadByUserId}
          onChange={(e) => setLeadByUserId(e.target.value)}
          className="rounded border border-amber-300 bg-white px-2 py-1.5 text-ink"
        >
          <option value="">Choose sales person…</option>
          {salesTeam.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Button onClick={assign} disabled={saving || !leadByUserId}>
          {saving ? "Saving…" : "Assign"}
        </Button>
        {error && <span className="text-red-700">{error}</span>}
      </div>
    </div>
  );
}
