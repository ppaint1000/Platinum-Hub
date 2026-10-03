"use client";

import { X } from "lucide-react";

export function Modal({
  title,
  onClose,
  onSave,
  saving,
  saveLabel = "Save",
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  // The confirm button's text, e.g. "Create copy" (default "Save").
  saveLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-4 py-[5vh]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted transition hover:bg-background hover:text-ink"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="flex max-h-[64vh] flex-col gap-4 overflow-y-auto px-5 py-4">
          {children}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-background"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
          >
            {saving ? "Saving…" : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted">
        {label}
        {required && <span className="text-brand-red"> *</span>}
      </span>
      {children}
    </label>
  );
}

// The grow-on-focus effect makes small boxes easier to hit-target and read
// while editing, but a flat 1.8x scale is too much on a phone — it spills
// over neighbouring fields and covers whatever's underneath until you tap
// away. Scale modestly (or not at all) on narrow screens, more on the room
// tablet/desktop actually have.
export const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-base sm:text-sm text-ink outline-none transition-transform duration-150 origin-left focus:border-brand-red focus:ring-1 focus:ring-brand-red focus:relative focus:z-20 focus:scale-100 sm:focus:scale-125 lg:focus:scale-150 focus:shadow-xl";
