"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inputClass } from "@/components/quotes/Modal";
import { fmtCurrency } from "@/lib/quotes/format";

// Allowances have no natural qty x rate split (a flat manually-entered $
// amount, same as the reference spreadsheet) — cost = sell, no mark-up,
// matching the spreadsheet's Allowances section exactly.
export function AllowancesEditor({
  quoteId,
  initialSite,
  initialOther,
}: {
  quoteId: string;
  initialSite: number;
  initialOther: number;
}) {
  const router = useRouter();
  const [site, setSite] = useState(String(initialSite || ""));
  const [other, setOther] = useState(String(initialOther || ""));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("quotes")
      .update({
        allowance_site: Number(site) || 0,
        allowance_other: Number(other) || 0,
      })
      .eq("id", quoteId);
    setSaving(false);
    router.refresh();
  }

  const rows: { label: string; value: string; onChange: (v: string) => void }[] = [
    { label: "Site", value: site, onChange: setSite },
    { label: "Other", value: other, onChange: setOther },
  ];

  return (
    <>
      {rows.map((row, i) => (
        <tr key={row.label} className="border-b border-border last:border-b-0">
          {i === 0 && (
            <td className="px-3 py-2 align-top text-ink" rowSpan={rows.length}>
              Allowances
            </td>
          )}
          <td className="px-3 py-2 text-muted">{row.label}</td>
          <td className="px-3 py-2 text-muted">—</td>
          <td className="px-3 py-2 text-muted">—</td>
          <td className="px-3 py-2">
            <input
              type="number"
              step="0.01"
              className={inputClass + " w-28"}
              value={row.value}
              onChange={(e) => row.onChange(e.target.value)}
              onBlur={save}
              placeholder="0.00"
            />
          </td>
          <td className="px-3 py-2 text-muted">—</td>
          <td className="whitespace-nowrap px-3 py-2 font-medium">
            {fmtCurrency(Number(row.value) || 0)}
            {saving && <span className="ml-1 text-xs text-muted">saving…</span>}
          </td>
        </tr>
      ))}
    </>
  );
}
