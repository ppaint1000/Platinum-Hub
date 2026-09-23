"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { createManualInvoiceAction } from "@/app/jobs/invoices/actions";

type SupplierOption = { id: string; name: string };

const RESENE = "Resene";

export function InvoiceUploadForm({ suppliers }: { suppliers: SupplierOption[] }) {
  const router = useRouter();
  const datalistId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // A typed-in name that isn't in `suppliers` yet is still a valid choice —
  // it's created the moment an invoice is actually saved against it (same
  // "type a new one" pattern as job categories), not before.
  const [supplierName, setSupplierName] = useState(
    suppliers.find((s) => s.name.toLowerCase() === RESENE.toLowerCase())?.name ?? RESENE
  );
  const isResene = supplierName.trim().toLowerCase() === RESENE.toLowerCase();

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/jobs/invoices/upload", { method: "POST", body: formData });
      const result = await res.json();

      if (!res.ok) {
        setError(result.error ?? "Couldn't upload that invoice.");
      } else {
        setSuccess(
          `Invoice ${result.invoiceNumber} uploaded — ${result.lineCount} line${
            result.lineCount === 1 ? "" : "s"
          }${result.matchedJobId ? ", matched to a job." : ", no matching order — assign a job below."}`
        );
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server — check your connection and try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="mb-6">
      <label className="mb-2 flex items-center gap-2 text-sm text-ink-soft">
        Supplier
        <input
          list={datalistId}
          value={supplierName}
          onChange={(e) => {
            setSupplierName(e.target.value);
            setSuccess(null);
            setError(null);
          }}
          placeholder="Pick one, or type a new supplier"
          className="w-56 rounded border border-line px-2 py-1.5 text-sm"
        />
        <datalist id={datalistId}>
          {suppliers.map((s) => (
            <option key={s.id} value={s.name} />
          ))}
        </datalist>
      </label>

      {isResene ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload Resene invoice (PDF)"}
          </Button>
        </>
      ) : (
        <ManualInvoiceForm
          supplierName={supplierName.trim() || RESENE}
          onDone={(message) => {
            setSuccess(message);
            router.refresh();
          }}
        />
      )}

      {error && (
        <p className="mt-2 text-sm" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}
      {success && <p className="mt-2 text-sm text-ink-soft">{success}</p>}
    </div>
  );
}

type ManualLine = { description: string; amount: string };
const EMPTY_LINE: ManualLine = { description: "", amount: "" };

// For a supplier with no PDF parser yet — Aalto and Superloo, until a
// sample invoice lets one be built (see parseReseneInvoice for what that
// looks like). Same job-costing flow from here: the invoice lands in
// "Needs a job" same as a parsed one.
function ManualInvoiceForm({
  supplierName,
  onDone,
}: {
  supplierName: string;
  onDone: (message: string) => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [lines, setLines] = useState<ManualLine[]>([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLine(i: number, patch: Partial<ManualLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true);
    setError(null);

    const result = await createManualInvoiceAction({
      supplierName,
      invoiceNumber,
      invoiceDate: invoiceDate || null,
      lines: lines.map((l) => ({ description: l.description, amount: Number(l.amount) || 0 })),
    });

    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setInvoiceNumber("");
    setInvoiceDate("");
    setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
    onDone(`${supplierName} invoice entered — assign it to a job below.`);
  }

  const total = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  return (
    <div className="max-w-xl rounded border border-line p-3">
      <p className="mb-3 text-sm text-ink-faint">
        No PDF reader for {supplierName} yet — enter the invoice by hand. It goes through the same
        job-costing flow as a parsed Resene invoice from here.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-soft">Invoice number (optional)</span>
          <input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            className="rounded border border-line px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-soft">Invoice date (optional)</span>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="rounded border border-line px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className="space-y-2">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              placeholder="Description"
              value={line.description}
              onChange={(e) => updateLine(i, { description: e.target.value })}
              className="min-w-0 flex-1 rounded border border-line px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="$"
              value={line.amount}
              onChange={(e) => updateLine(i, { amount: e.target.value })}
              className="no-spinner w-28 rounded border border-line px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => removeLine(i)}
              disabled={lines.length <= 1}
              aria-label="Remove line"
              className="text-sm text-ink-faint underline hover:text-ink disabled:opacity-40"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={addLine} className="text-sm text-ink-faint underline hover:text-ink">
          + Add line
        </button>
        <span className="text-sm text-ink-soft">
          Total: {new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(total)}
        </span>
      </div>

      <div className="mt-3">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save invoice"}
        </Button>
      </div>

      {error && (
        <p className="mt-2 text-sm" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}
    </div>
  );
}
