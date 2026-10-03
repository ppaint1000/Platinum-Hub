// The open costing editor registers itself here so the tab bar — a separate
// component — can ask whether there are unsaved changes before navigating
// away, and offer to save them.
export type UnsavedGuard = {
  isDirty: () => boolean;
  // Resolves true if the save went through.
  save: () => Promise<boolean>;
  discard: () => void;
};

let current: UnsavedGuard | null = null;

export function setUnsavedGuard(guard: UnsavedGuard | null) {
  current = guard;
}

export function getUnsavedGuard(): UnsavedGuard | null {
  return current;
}
