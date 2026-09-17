"use client";

import { useId } from "react";

// Free-text input with autocomplete from every "lost to" name used before —
// pick one or type a new competitor, same pattern as the job category
// fields elsewhere in Jobs.
export function LostToField({
  value,
  onChange,
  options,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  autoFocus?: boolean;
}) {
  const listId = useId();

  return (
    <>
      <input
        autoFocus={autoFocus}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Lost to — pick one or type a new one"
        className="rounded border border-line px-2 py-1.5 text-sm"
      />
      <datalist id={listId}>
        {options.map((label) => (
          <option key={label} value={label} />
        ))}
      </datalist>
    </>
  );
}
