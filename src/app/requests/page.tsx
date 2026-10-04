// Requests — new enquiries (like Jobber's): from the website's quote form or
// typed in after a call, until they become a site measure. Admins see them
// all; Measures / Costing users see theirs and the ones not given out yet.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMcAccess, fetchMcOwners } from "@/lib/quotes/mcAccess";
import { navForViewer } from "@/lib/nav";
import { DashboardShell } from "@/components/dashboard/parts";
import { TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { RequestsList, type RequestRow } from "@/components/requests/RequestsList";

export const metadata: Metadata = { title: "Requests · Platinum Hub" };

export default async function RequestsPage() {
  const a = await getMcAccess();
  if (!a.isAdmin && !a.measures && !a.costing) redirect("/hub");
  const supabase = await createClient();
  const [{ data: rows }, { data: clients }, owners, nav] = await Promise.all([
    supabase
      .from("requests")
      .select("id, created_at, name, company, email, phone, address, message, source, status, owner_id, client_id, site_measure_id, notes")
      .order("created_at", { ascending: false })
      .returns<RequestRow[]>(),
    supabase.from("clients").select("id, name").order("name").returns<{ id: string; name: string }[]>(),
    a.isAdmin ? fetchMcOwners() : Promise.resolve(null),
    navForViewer(),
  ]);

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={nav} activeHref="/requests" />}
      todayKey={nzTodayDateString()}
      title="Requests"
    >
      <RequestsList rows={rows ?? []} clients={clients ?? []} owners={owners} />
    </DashboardShell>
  );
}
