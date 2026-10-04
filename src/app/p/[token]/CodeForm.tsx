"use client";

import Image from "next/image";
import { useActionState } from "react";
import { enterProposalCode } from "./actions";

// The customer's first step: the 6-digit code sent with their link.
export function CodeForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(enterProposalCode.bind(null, token), undefined);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-white p-6 text-center shadow-sm">
        <Image src="/measures-logo.webp" alt="Platinum Painters" width={180} height={72} priority className="mx-auto h-auto w-40" />
        <h1 className="text-xl font-semibold text-ink">Your painting proposal</h1>
        <p className="text-sm text-muted">Enter the 6-digit code that came with your link.</p>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          autoFocus
          placeholder="123456"
          className="w-full rounded-lg border border-border px-3 py-3 text-center text-2xl tracking-[0.4em] text-ink"
        />
        {state?.error && <p className="text-sm text-brand-red-dark">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand-red px-3 py-2.5 font-semibold text-white hover:bg-brand-red-dark disabled:opacity-60"
        >
          {pending ? "Checking…" : "Open proposal"}
        </button>
        <p className="text-xs text-muted">No code? Reply to the email you were sent and we&apos;ll resend it.</p>
      </form>
    </main>
  );
}
