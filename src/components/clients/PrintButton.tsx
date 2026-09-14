"use client";

import { Button } from "@/components/ui";

// The browser's own print dialog already offers "Save as PDF" on every
// platform, so this needs no PDF library - just trigger it and let
// print:hidden/print-only CSS on the page control what ends up on paper.
export function PrintButton() {
  return (
    <div className="print:hidden">
      <Button variant="secondary" onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
}
