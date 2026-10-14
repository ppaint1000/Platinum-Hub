"use server";

import { createClient } from "@/lib/supabase/server";
import { latestClockInByJob } from "./recentClockIns";

// For job pickers that load in the browser (the order form): each job's
// latest clock-in, so they can sort the jobs crews are on to the top.
// Only dates per job id - no names or hours.
export async function latestClockInsAction(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};
  return Object.fromEntries(await latestClockInByJob());
}
