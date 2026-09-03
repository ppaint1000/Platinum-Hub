"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** The signed-in user's profile role ("admin", "supervisor", …), or null while loading / signed out. */
export function useUserRole() {
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single()
        .then(({ data }) => setRole(data?.role ?? null));
    });
  }, []);

  return role;
}
