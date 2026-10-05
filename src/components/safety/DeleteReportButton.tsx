"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteReportAction } from "@/app/safety/actions";

export function DeleteReportButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this report? This can't be undone.")) return;
        start(async () => {
          const r = await deleteReportAction(id);
          if (r.error) alert(r.error);
          else router.push("/safety/reports");
        });
      }}
      className="rounded-lg px-3 py-2 text-sm font-semibold text-[#B91C1C] hover:bg-[#FDECEC]"
    >
      Delete
    </button>
  );
}
