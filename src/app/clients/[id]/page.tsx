// One client: details, contacts, jobs and a timeline (see ClientPage).
import { notFound } from "next/navigation";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { ClientPage, type ClientJob, type ClientNote, type ClientPageRow, type ClientSite } from "@/components/clients/ClientPage";
import type { ContactRow } from "@/components/clients/ClientDetail";
import { fetchSalesTeam } from "@/lib/jobs/salesTeam";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { DashboardShell } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

type NoteRow = {
  id: string;
  body: string;
  created_at: string;
  author: { full_name: string } | { full_name: string }[] | null;
};

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await requireAppAccess("jobs");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, notes, email, phone, address, sales_person_id, created_at, updated_at")
    .eq("id", id)
    .single<ClientPageRow>();

  if (!client) notFound();

  const [{ data: contacts }, { data: jobs }, { data: noteRows }, salesTeam, profile, { data: sites }] = await Promise.all([
    supabase
      .from("client_contacts")
      .select("id, name, email, phone, job_id")
      .eq("client_id", id)
      .order("name")
      .returns<ContactRow[]>(),
    supabase
      .from("jobs")
      .select(
        "id, job_number, name, status, quoted_sell_total, quoted_at, won_at, lost_at, lost_to, lead_source, lead_by_user_id, created_at, proposal_url, proposal_sent_at, proposal_viewed_at, proposal_view_count, proposal_accepted_at"
      )
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .returns<ClientJob[]>(),
    supabase
      .from("client_notes")
      .select("id, body, created_at, author:profiles(full_name)")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .returns<NoteRow[]>(),
    fetchSalesTeam(supabase),
    getCurrentProfile(),
    // Where painters clock in for this client (Settings → Sites).
    supabase
      .from("sites")
      .select("id, name, address, is_active")
      .eq("client_id", id)
      .order("is_active", { ascending: false })
      .order("name")
      .returns<ClientSite[]>(),
  ]);

  const notes: ClientNote[] = (noteRows ?? []).map((n) => ({
    id: n.id,
    body: n.body,
    created_at: n.created_at,
    author: (Array.isArray(n.author) ? n.author[0]?.full_name : n.author?.full_name) ?? null,
  }));

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={ADMIN_NAV} activeHref="/clients" />}
      todayKey={nzTodayDateString()}
      title={client.name}
    >
      <ClientPage
        client={client}
        contacts={contacts ?? []}
        jobs={jobs ?? []}
        notes={notes}
        sites={sites ?? []}
        salesTeam={salesTeam}
        canChangeSalesPerson={profile.role === "admin"}
      />
    </DashboardShell>
  );
}
