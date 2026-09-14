"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { overBudgetColor } from "@/design/tailwind.tokens";

export function InvoiceUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      {error && (
        <p className="mt-2 text-sm" style={{ color: overBudgetColor }}>
          {error}
        </p>
      )}
      {success && <p className="mt-2 text-sm text-ink-soft">{success}</p>}
    </div>
  );
}
