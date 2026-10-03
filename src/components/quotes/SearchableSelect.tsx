"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inputClass } from "@/components/quotes/Modal";

type Option = { id: string; label: string; sublabel?: string };

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Search…",
  emptyLabel = "None",
  className = "",
  secondaryOption,
  emptyMessage = "No matches",
  autoOpen = false,
  onClose,
}: {
  options: Option[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  // Shown when nothing matches — a picker with no options at all can say why.
  emptyMessage?: string;
  // An extra always-visible entry pinned right after the empty/cancel
  // option — e.g. "Custom", for a picker that also needs an escape hatch
  // to a blank/manual entry instead of one of the listed options.
  secondaryOption?: { label: string; onSelect: () => void };
  // For a picker that stands in for a button: open the list as soon as it
  // appears, and tell the parent when it's dismissed (clicked away from, or
  // Escape) without a choice so the button can come back.
  autoOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) ?? null;

  function openDropdown() {
    const el = inputRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 220) });
    }
    setOpen(true);
  }

  // Focusing the input opens the list (onFocus), so this opens it on mount.
  useEffect(() => {
    if (autoOpen) inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;

    function dismiss() {
      setOpen(false);
      setQuery("");
      onClose?.();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }

    function reposition() {
      const el = inputRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 220) });
      }
    }
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        inputRef.current &&
        !inputRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        dismiss();
      }
    }

    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  function pick(id: string | null) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <input
        ref={inputRef}
        className={inputClass + " " + className}
        value={open ? query : (selected?.label ?? "")}
        placeholder={selected ? undefined : placeholder}
        onFocus={openDropdown}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) openDropdown();
        }}
      />
      {open &&
        rect &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width }}
            className="z-50 max-h-56 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg"
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(null)}
              className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm text-muted hover:bg-background"
            >
              — {emptyLabel} —
            </button>
            {secondaryOption && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  secondaryOption.onSelect();
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm font-medium text-brand-red-dark hover:bg-background"
              >
                {secondaryOption.label}
              </button>
            )}
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-muted">{emptyMessage}</p>
            )}
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o.id)}
                className="block w-full whitespace-nowrap px-3 py-2 text-left text-sm text-ink hover:bg-background"
              >
                {o.label}
                {o.sublabel && <span className="ml-1.5 text-xs text-muted">{o.sublabel}</span>}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
