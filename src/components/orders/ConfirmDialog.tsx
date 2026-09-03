"use client";

import { X } from "lucide-react";

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  confirmingLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  confirming,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmingLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  confirming?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-[5vh]"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button
            onClick={onCancel}
            aria-label="Close"
            className="rounded-md p-1 text-muted transition hover:bg-background hover:text-ink"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="px-5 py-4 text-sm text-ink">
          {message}
          {children && <div className="mt-3">{children}</div>}
          {error && <p className="mt-3 text-sm text-brand-red">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
          <button
            onClick={onCancel}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-background"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
              tone === "danger" ? "bg-brand-red hover:bg-brand-red-dark" : "bg-ink hover:bg-black"
            }`}
          >
            {confirming ? confirmingLabel ?? confirmLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
