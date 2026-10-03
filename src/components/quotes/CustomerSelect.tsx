"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { inputClass } from "@/components/quotes/Modal";
import { addClient } from "@/lib/quotes/addClient";

type Customer = { id: string; name: string };

const NEW_CUSTOMER = "__new__";

// A plain customer <select> whose first entry, "+ New customer", turns into
// a name box, so a new customer doesn't have to be created on the dedicated
// Customers page first — used on the Costing and Site Measures forms. The
// new customer is pushed to the Hub the same way the Customers page does,
// and handed back via onCreated so the caller can fold it into whatever
// customer list it's already holding.
export function CustomerSelect({
  customers,
  value,
  onChange,
  onCreated,
  unassignedLabel,
  className,
}: {
  customers: Customer[];
  value: string;
  onChange: (id: string) => void;
  onCreated?: (customer: Customer) => void;
  unassignedLabel?: string;
  className?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return setError("Enter a name.");
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data, error: err } = await addClient(supabase, name);
    setSaving(false);
    if (err || !data) return setError("Couldn't add — " + err?.message);

    onCreated?.(data);
    onChange(data.id);
    setName("");
    setAdding(false);
  }

  if (adding) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            className={inputClass + " flex-1"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New customer name"
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button
            type="button"
            onClick={create}
            disabled={saving}
            className="whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:opacity-60"
          >
            {saving ? "Adding…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
            className="whitespace-nowrap rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:bg-background"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-xs text-brand-red">{error}</p>}
      </div>
    );
  }

  return (
    <select
      className={(className ?? inputClass) + " w-full"}
      value={value}
      onChange={(e) => {
        if (e.target.value === NEW_CUSTOMER) return setAdding(true);
        onChange(e.target.value);
      }}
    >
      <option value={NEW_CUSTOMER}>+ New customer</option>
      {unassignedLabel && <option value="">{unassignedLabel}</option>}
      {customers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
