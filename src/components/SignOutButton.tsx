"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Signed out on purpose - the sign-in page shouldn't say "you were signed out".
    document.cookie = "hub_sess=; Max-Age=0; path=/";
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button onClick={handleSignOut} className={className}>
      Sign out
    </button>
  );
}
