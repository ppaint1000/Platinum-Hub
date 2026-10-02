// Clients — customer/contact details for Jobs, as a table (see ClientsList).
// Shares the Jobs app-access flag; has its own Hub tile too.
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { ClientsList, type ClientRow } from "@/components/clients/ClientsList";
import { fetchSalesTeam } from "@/lib/jobs/salesTeam";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { isWon, type JobStatus } from "@/lib/clients/winRate";
import { DashboardShell } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

type Row = Omit<ClientRow, "contactCount" | "quoteCount" | "wonCount" | "wonValue"> & {
  client_contacts: { count: number }[];
  jobs: { status: JobStatus; quoted_sell_total: number | null }[];
};

export default async function ClientsPage() {
  const supabase = await requireAppAccess("jobs");

  const [{ data }, salesTeam, profile] = await Promise.all([
    supabase
      .from("clients")
      .select(
        "id, name, notes, email, phone, address, sales_person_id, created_at, updated_at, client_contacts(count), jobs(status, quoted_sell_total)"
      )
      .order("name")
      .returns<Row[]>(),
    fetchSalesTeam(supabase),
    getCurrentProfile(),
  ]);

  // Quotes = everything past a draft; won = won, under way or complete.
  const clients: ClientRow[] = (data ?? []).map(({ client_contacts, jobs, ...c }) => {
    const quoted = (jobs ?? []).filter((j) => j.status !== "draft");
    const won = quoted.filter((j) => isWon(j.status));
    return {
      ...c,
      contactCount: client_contacts?.[0]?.count ?? 0,
      quoteCount: quoted.length,
      wonCount: won.length,
      wonValue: won.reduce((s, j) => s + Number(j.quoted_sell_total ?? 0), 0),
    };
  });

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={ADMIN_NAV} activeHref="/clients" />}
      todayKey={nzTodayDateString()}
      title="Clients"
    >
      <ClientsList
        clients={clients}
        salesTeam={salesTeam}
        currentUserId={profile.id}
        isAdmin={profile.role === "admin"}
      />
    </DashboardShell>
  );
}
