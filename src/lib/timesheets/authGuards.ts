import { redirect } from "next/navigation";
import { getCurrentProfile, type Profile } from "@/lib/supabase/profile";

// Ported from the standalone Timesheets app's src/lib/authGuards.ts — same
// behavior, redirect target updated from the old bare /clock to the new
// /timesheets/clock now that these routes live inside the Hub.

export async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (profile.role !== "admin") {
    redirect("/timesheets/clock");
  }
  return profile;
}

export async function requireAdminOrSupervisor(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (profile.role !== "admin" && profile.role !== "supervisor") {
    redirect("/timesheets/clock");
  }
  return profile;
}
