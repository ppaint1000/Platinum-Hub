"use client";

import { useState } from "react";
import { Panel, Button } from "@/components/ui";

/** Shows a freshly generated/reset password once, with a copy button. */
export function TempPasswordReveal({
  password,
  onDismiss,
}: {
  password: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
  }

  return (
    <Panel className="mb-4 border-accent p-4">
      <p className="text-sm text-ink">
        Temporary password — copy it now and relay it to them. It won&apos;t be shown again.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <code className="rounded bg-paper-sunken px-3 py-2 font-mono text-sm text-ink">
          {password}
        </code>
        <Button variant="secondary" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="secondary" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </Panel>
  );
}
