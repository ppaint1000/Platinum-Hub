"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { McOwner } from "@/lib/quotes/mcAccess";

// Admins: whose costing / site measure this is. Only they (and admins) see
// it - set here for ones made before the move into the Hub.
export function OwnerSelect({
  table,
  id,
  ownerId,
  owners,
}: {
  table: "quotes" | "site_measures";
  id: string;
  ownerId: string | null;
  owners: McOwner[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(ownerId ?? "");
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    setValue(next);
    setSaving(true);
    const { error } = await createClient().from(table).update({ owner_id: next || null }).eq("id", id);
    setSaving(false);
    if (error) {
      alert("Couldn't change it - " + error.message);
      setValue(ownerId ?? "");
      return;
    }
    router.refresh();
  }

  return (
    <select
      value={value}
      disabled={saving}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => change(e.target.value)}
      aria-label="Salesperson"
      className={`rounded-md border px-2 py-1 text-sm ${value ? "border-border bg-surface text-ink" : "border-brand-red bg-red-50 text-brand-red-dark"}`}
    >
      <option value="">Nobody (admins only)</option>
      {owners.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
