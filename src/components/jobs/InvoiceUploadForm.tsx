"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";
import { createManualInvoiceAction } from "@/app/jobs/invoices/actions";

type SupplierOption = { id: string; name: string };

const RESENE = "Resene";
const OTHER = "__other__";

// Suppliers with a working PDF parser (src/lib/<name>/parseInvoice.ts) —
// keep in sync with the PARSERS map in the upload route. Anything else
// typed into the dropdown falls back to manual entry.
const PARSED_SUPPLIERS = ["resene", "aalto", "superloo"];

type CreatedInvoice = { invoiceNumber: string; matchedJobId: string | null; lineCount: number };

export function InvoiceUploadForm({ suppliers }: { suppliers: SupplierOption[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reseneName = suppliers.find((s) => s.name.toLowerCase() === RESENE.toLowerCase())?.name ?? RESENE;

  // A real <select> rather than a text input + datalist — a datalist's
  // suggestions are filtered by whatever's already typed in the box, so
  // with the field pre-filled ("Resene") every other supplier was hidden
  // until that text was cleared. "Type a new supplier" is its own option
  // that reveals a text field; a typed name that isn't in `suppliers` yet
  // is still a valid choice — it's created the moment an invoice is
  // actually saved against it (same "type a new one" pattern as job
  // categories), not before.
  const [selected, setSelected] = useState(reseneName);
  const [customName, setCustomName] = useState("");
  const supplierName = selected === OTHER ? customName : selected;
  const hasParser = PARSED_SUPPLIERS.includes(supplierName.trim().toLowerCase());

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function describeUpload(supplier: string, invoices: CreatedInvoice[], skippedDuplicates: number) {
    const parts =
      invoices.length === 1
        ? `Invoice ${invoices[0].invoiceNumber} uploaded — ${invoices[0].lineCount} line${
            invoices[0].lineCount === 1 ? "" : "s"
          }${invoices[0].matchedJobId ? ", matched to a job." : ", no matching order — assign a job below."}`
        : `${invoices.length} ${supplier} invoices uploaded from this file (${invoices
            .map((i) => i.invoiceNumber)
            .join(", ")}) — assign each to a job below.`;
    return skippedDuplicates > 0
      ? `${parts} (${skippedDuplicates} already uploaded, skipped.)`
      : parts;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("supplier", supplierName.trim());
      const res = await fetch("/api/jobs/invoices/upload", { method: "POST", body: formData });
      const result = await res.json();

      if (!res.ok) {
        setError(result.error ?? "Couldn't upload that invoice.");
      } else {
        setSuccess(describeUpload(supplierName.trim(), result.invoices, result.skippedDuplicates ?? 0));
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
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        <label className="flex items-center gap-2">
          Supplier
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setSuccess(null);
              setError(null);
            }}
            className="rounded border border-line px-2 py-1.5 text-sm"
          >
            {suppliers.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
            {!suppliers.some((s) => s.name.toLowerCase() === RESENE.toLowerCase()) && (
              <option value={RESENE}>{RESENE}</option>
            )}
            <option value={OTHER}>Type a new supplier…</option>
          </select>
        </label>
        {selected === OTHER && (
          <input
            autoFocus
            value={customName}
            onChange={(e) => {
              setCustomName(e.target.value);
              setSuccess(null);
              setError(null);
            }}
            placeholder="Supplier name"
            className="w-48 rounded border border-line px-2 py-1.5 text-sm"
          />
        )}
      </div>

      {selected === OTHER && !customName.trim() ? (
        <p className="text-sm text-ink-faint">Enter the supplier&apos;s name above to continue.</p>
      ) : hasParser ? (
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
            {uploading ? "Uploading…" : `Upload ${supplierName.trim()} invoice (PDF)`}
          </Button>
        </>
      ) : (
        <ManualInvoiceForm
          supplierName={supplierName.trim()}
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

// For a supplier with no PDF parser — anything beyond Resene, Aalto and
// Superloo, until a sample invoice lets one be built (see
// parseReseneInvoice for what that looks like). Same job-costing flow
// from here: the invoice lands in "Needs a job" same as a parsed one.
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
