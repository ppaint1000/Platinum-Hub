"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

// Sales and supervisor sign-ins get a GPS stamp for the sign-in log
// (Users → Sign-in log). Painters are stamped when they clock in instead.
const LOCATED_ROLES = ["sales", "supervisor"];

type Located =
  | { status: "shared"; lat: number; lng: number; accuracy: number }
  | { status: "denied" | "unavailable"; lat: null; lng: null; accuracy: null };

function locate(): Promise<Located> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve({ status: "unavailable", lat: null, lng: null, accuracy: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ status: "shared", lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) =>
        resolve({ status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable", lat: null, lng: null, accuracy: null }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  // Sent here by the Hub after being signed out (e.g. this account signed
  // in on another device).
  const ended = useSearchParams().get("ended") === "1";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("That email or password isn't right. Try again.");
      setLoading(false);
      return;
    }

    try {
      const { data: me } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      if (me && LOCATED_ROLES.includes(me.role as string)) {
        setLocating(true);
        const at = await locate();
        await supabase.rpc("hub_set_sign_in_location", {
          p_status: at.status,
          p_lat: at.lat,
          p_lng: at.lng,
          p_accuracy: at.accuracy,
        });
      }
    } catch {
      // The stamp is a record, not a lock - signing in carries on without it.
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/logo.webp"
            alt="Platinum Painters"
            width={220}
            height={88}
            priority
            className="mb-4 h-auto w-44"
          />
          <h1 className="text-xl font-semibold text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Platinum Painters Hub</p>
        </div>

        {ended && (
          <p className="mt-5 rounded-lg bg-[#FFF8E1] px-3 py-2 text-sm text-ink">
            You&apos;ve been signed out. Your account was signed in on another device, or it was turned off. Sign in again
            to carry on.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-brand-red">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-ink py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
          >
            {locating ? "Checking your location…" : loading ? "Signing in…" : "Sign in"}
          </button>
          {locating && (
            <p className="text-center text-xs text-muted">
              Sales and supervisor sign-ins are location stamped. Tap Allow if your browser asks.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
