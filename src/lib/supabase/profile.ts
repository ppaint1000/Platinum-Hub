import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "supervisor" | "painter" | "sales";

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
};

// cache() memoizes per request — ported from Timesheets, where the layout
// and the page both called this on every navigation, firing two separate
// auth+profile round trips to Supabase for a single page load before this
// was added.
export const getCurrentProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();

  // The proxy middleware already called auth.getUser() once this request to
  // verify the session, and stamped the result on this header — reusing it
  // here skips a second network round-trip to Supabase Auth for the same
  // check. Falls back to a real getUser() call if the header is missing
  // (e.g. a route not covered by the middleware matcher).
  const verifiedUserId = (await headers()).get("x-verified-user-id");

  let userId = verifiedUserId;
  if (!userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  }

  if (!userId) {
    redirect("/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .single();

  if (!profile) {
    redirect("/sign-in");
  }

  return profile;
});
