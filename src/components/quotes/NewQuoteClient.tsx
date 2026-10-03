"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Field, inputClass } from "@/components/quotes/Modal";
import { pushQuoteToHub } from "@/lib/quotes/hubSync";
import { addClient } from "@/lib/quotes/addClient";

type Customer = { id: string; name: string };

export function NewQuoteClient({ customers }: { customers: Customer[] }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(customers.length === 0);
  const [location, setLocation] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createQuote() {
    setError(null);

    if (creatingCustomer && !newCustomerName.trim()) {
      return setError("Enter a customer name.");
    }
    if (!creatingCustomer && !customerId) {
      return setError("Choose a customer.");
    }

    setSaving(true);
    const supabase = createClient();

    let finalCustomerId = customerId;

    if (creatingCustomer) {
      const { data, error: custError } = await addClient(supabase, newCustomerName);

      if (custError || !data) {
        setSaving(false);
        return setError("Couldn't create customer — " + custError?.message);
      }
      finalCustomerId = data.id;
    }

    // Pull the company's standard rates in as this costing's starting point
    // — the same numbers as the yellow boxes in the reference spreadsheet —
    // rather than making the estimator retype them every time.
    const { data: rates } = await supabase
      .from("costing_settings")
      .select(
        "labour_rate_sell, labour_rate_cost, spread_rate_sqm_per_litre, overtime_pct, overtime_rate, overtime_default_enabled, repaint_coats, general_prep_rate_sqm_per_hr, markup_material_pct, markup_other_pct, negotiating_factor_pct, gst_pct"
      )
      .limit(1)
      .maybeSingle();

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .insert({
        customer_id: finalCustomerId,
        location: location.trim() || null,
        valid_until: validUntil || null,
        notes: notes.trim() || null,
        status: "draft",
        tax_rate: rates ? rates.gst_pct * 100 : undefined,
        labour_rate_sell: rates?.labour_rate_sell,
        labour_rate_cost: rates?.labour_rate_cost,
        spread_rate_sqm_per_litre: rates?.spread_rate_sqm_per_litre,
        overtime_pct: rates?.overtime_pct,
        overtime_rate: rates?.overtime_rate,
        overtime_enabled: rates?.overtime_default_enabled ?? false,
        repaint_coats: rates?.repaint_coats,
        general_prep_rate_sqm_per_hr: rates?.general_prep_rate_sqm_per_hr,
        markup_material_pct: rates?.markup_material_pct,
        markup_other_pct: rates?.markup_other_pct,
        negotiating_factor_pct: rates?.negotiating_factor_pct,
        gst_pct: rates?.gst_pct,
      })
      .select("id")
      .single();

    setSaving(false);

    if (quoteError || !quote) {
      return setError("Couldn't create costing — " + quoteError?.message);
    }

    pushQuoteToHub({
      id: quote.id,
      customerId: finalCustomerId || null,
      name: location.trim() || "Untitled quote",
      status: "draft",
      total: null,
      totalHours: 0,
    });

    router.push(`/costing/${quote.id}`);
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold text-ink">New costing</h1>
      <p className="mt-1 text-sm text-muted">
        Start with the customer and job details — you&apos;ll add areas and line items next.
      </p>

      <div className="mt-6 flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <Field label="Customer" required>
          {creatingCustomer ? (
            <div className="flex flex-col gap-2">
              <input
                className={inputClass}
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="Customer name"
                autoFocus
              />
              {customers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCreatingCustomer(false)}
                  className="self-start text-xs font-medium text-brand-red-dark hover:underline"
                >
                  Choose an existing customer instead
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <select
                className={inputClass}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select a customer…</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setCreatingCustomer(true)}
                className="self-start text-xs font-medium text-brand-red-dark hover:underline"
              >
                + Add a new customer
              </button>
            </div>
          )}
        </Field>

        <Field label="Job location">
          <input
            className={inputClass}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="123 Example Rd, Auckland"
          />
        </Field>

        <Field label="Valid until">
          <input
            type="date"
            className={inputClass}
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </Field>

        <Field label="Notes">
          <textarea
            className={inputClass + " min-h-20 resize-y"}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-brand-red">{error}</p>}

        <button
          onClick={createQuote}
          disabled={saving}
          className="mt-1 rounded-lg bg-ink py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
        >
          {saving ? "Creating…" : "Create quote"}
        </button>
      </div>
    </div>
  );
}
