// Clients — customer/contact details for Jobs, as a table (see ClientsList).
// Shares the Jobs app-access flag; has its own Hub tile too.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { ClientsList, type ClientRow } from "@/components/clients/ClientsList";
import { fetchSalesTeam } from "@/lib/jobs/salesTeam";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { isWon, type JobStatus } from "@/lib/clients/winRate";

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
    <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href="/hub"
          className="flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Hub
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/clients/dashboard" className="text-sm font-medium text-accent hover:text-accent-hover">
            Dashboard
          </Link>
          <Link href="/clients/report" className="text-sm font-medium text-accent hover:text-accent-hover">
            Win rate report
          </Link>
        </div>
      </div>

      <ClientsList
        clients={clients}
        salesTeam={salesTeam}
        currentUserId={profile.id}
        isAdmin={profile.role === "admin"}
      />
    </div>
  );
}
