// The page ticks on the Users page that the database checks itself
// (hub_page_ok): Production board, Schedule, Health & safety. Admins can
// always open them.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type CheckedPage = "production" | "schedule" | "safety";

export async function canOpenPage(page: CheckedPage): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("hub_page_ok", { p_page: page });
  return data === true;
}

// For a page itself: anyone without the tick goes to their landing page.
export async function requirePage(page: CheckedPage) {
  if (!(await canOpenPage(page))) redirect("/");
  return createClient();
}
