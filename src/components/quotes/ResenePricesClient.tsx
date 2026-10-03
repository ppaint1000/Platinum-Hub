"use client";

import { useMemo, useState } from "react";
import { Pencil, Search } from "lucide-react";
import { Modal, Field, inputClass } from "@/components/quotes/Modal";
import { fmtCurrency, fmtDate } from "@/lib/quotes/format";

export type ResenePrice = {
  itemCode: string;
  description: string;
  base: string | null;
  sizeLitres: number | null;
  unitPrice: number;
  pricePerLitre: number | null;
  invoiceNumber: string | null;
  priceDate: string | null;
  // True once someone's corrected this item by hand (see the Edit button
  // below) - the Hub then keeps it as-is until an invoice comes in at an
  // actually different $, rather than every reinvoice at the same price
  // silently overwriting the correction.
  editedManually: boolean;
  editedAt: string | null;
};

const COMMON_BASES = ["Deep", "Ultra Deep", "Mid", "Pastel", "Accent", "White & Light"];

function fmtSize(litres: number | null) {
  if (litres == null) return "—";
  return litres < 1 ? `${Math.round(litres * 1000)} ml` : `${litres} L`;
}

export function ResenePricesClient({
  prices,
  error,
}: {
  prices: ResenePrice[];
  error: string | null;
}) {
  const [items, setItems] = useState(prices);
  const [query, setQuery] = useState("");
  const [includeOther, setIncludeOther] = useState(false);
  const [editing, setEditing] = useState<ResenePrice | null>(null);

  const paintCount = useMemo(() => items.filter((p) => p.sizeLitres != null).length, [items]);

  // Every word typed has to appear somewhere in the product name, code or
  // base, so "summit mid" narrows the way you'd expect.
  const visible = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((p) => {
      if (!includeOther && p.sizeLitres == null) return false;
      if (words.length === 0) return true;
      const haystack = `${p.description} ${p.itemCode} ${p.base ?? ""}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [items, query, includeOther]);

  function applyEdit(updated: ResenePrice) {
    setItems((cur) => cur.map((p) => (p.itemCode === updated.itemCode ? updated : p)));
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Resene Paint Prices</h1>
        <p className="mt-1 text-sm text-muted">
          What you were last invoiced for each Resene product, after your trade discount. It
          updates whenever a Resene invoice is uploaded in the Hub. Per litre is the price divided
          by the size. Use Edit to correct the base or size when an invoice&apos;s wording doesn&apos;t
          give us a clean one — a later invoice at the same $ won&apos;t overwrite it, only a
          genuinely different price will.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-border bg-surface px-5 py-8 text-center text-sm text-muted shadow-sm">
          {error}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="relative min-w-[16rem] flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by product, colour, base or code"
                aria-label="Search Resene products"
                className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-base text-ink outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red sm:text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={includeOther}
                onChange={(e) => setIncludeOther(e.target.checked)}
              />
              Include brushes, tools and other non-paint items
            </label>
            <span className="text-sm text-muted">
              {visible.length} of {includeOther ? items.length : paintCount}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
            {visible.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted">
                {items.length === 0
                  ? "No prices yet — they appear here once a Resene invoice has been uploaded in the Hub."
                  : "No products match that search."}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3">Base</th>
                    <th className="px-5 py-3">Size</th>
                    <th className="px-5 py-3 text-right">Price</th>
                    <th className="px-5 py-3 text-right">Per litre</th>
                    <th className="hidden px-5 py-3 md:table-cell">Last invoiced</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p) => (
                    <tr key={p.itemCode} className="border-b border-border last:border-b-0 hover:bg-background">
                      <td className="px-5 py-3">
                        <div className="font-medium text-ink">{p.description}</div>
                        <div className="text-xs text-muted">{p.itemCode}</div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted">{p.base ?? "—"}</td>
                      <td className="whitespace-nowrap px-5 py-3">{fmtSize(p.sizeLitres)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums">
                        {fmtCurrency(p.unitPrice)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-medium tabular-nums">
                        {p.pricePerLitre != null ? fmtCurrency(p.pricePerLitre) : "—"}
                      </td>
                      <td className="hidden whitespace-nowrap px-5 py-3 text-muted md:table-cell">
                        {p.editedManually ? (
                          <span>Edited{p.editedAt && ` ${fmtDate(p.editedAt)}`}</span>
                        ) : (
                          <>
                            {fmtDate(p.priceDate)}
                            {p.invoiceNumber && <span className="text-xs"> · inv {p.invoiceNumber}</span>}
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right">
                        <button
                          onClick={() => setEditing(p)}
                          aria-label={`Edit ${p.description}`}
                          className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-ink"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {editing && (
        <EditPriceModal price={editing} onClose={() => setEditing(null)} onSaved={applyEdit} />
      )}
    </div>
  );
}

function EditPriceModal({
  price,
  onClose,
  onSaved,
}: {
  price: ResenePrice;
  onClose: () => void;
  onSaved: (updated: ResenePrice) => void;
}) {
  const [base, setBase] = useState(price.base ?? "");
  const [sizeLitres, setSizeLitres] = useState(price.sizeLitres != null ? String(price.sizeLitres) : "");
  const [unitPrice, setUnitPrice] = useState(String(price.unitPrice));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/costing/resene-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemCode: price.itemCode,
        base: base.trim() || null,
        sizeLitres: sizeLitres === "" ? null : Number(sizeLitres),
        unitPrice: Number(unitPrice),
      }),
    });
    const result = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok || result.error) {
      setError(result.error ?? "Couldn't save.");
      return;
    }
    if (result.price) onSaved(result.price);
    onClose();
  }

  return (
    <Modal title={`Edit — ${price.description}`} onClose={onClose} onSave={save} saving={saving}>
      <Field label="Base">
        <input
          className={inputClass}
          list="resene-price-bases"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          placeholder="e.g. Mid, Deep — leave blank if none"
        />
        <datalist id="resene-price-bases">
          {COMMON_BASES.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </Field>
      <Field label="Size (litres)">
        <input
          className={inputClass}
          type="number"
          step="0.001"
          min="0"
          value={sizeLitres}
          onChange={(e) => setSizeLitres(e.target.value)}
          placeholder="Leave blank for tools/sundries"
        />
      </Field>
      <Field label="Price" required>
        <input
          className={inputClass}
          type="number"
          step="0.01"
          min="0"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
        />
      </Field>
      {error && <p className="text-sm text-brand-red">{error}</p>}
    </Modal>
  );
}
