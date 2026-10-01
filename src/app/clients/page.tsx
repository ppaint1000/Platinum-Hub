// Clients — customer/contact details for Jobs. Shares the Jobs app-access
// flag; has its own Hub tile too.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Panel } from "@/components/ui";
import { ClientsList, type ClientRow } from "@/components/clients/ClientsList";
import { fetchSalesTeam } from "@/lib/jobs/salesTeam";
import { getCurrentProfile } from "@/lib/supabase/profile";

export default async function ClientsPage() {
  const supabase = await requireAppAccess("jobs");

  const [{ data: clients }, salesTeam, profile] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, notes, sales_person_id, client_contacts(count)")
      .order("name")
      .returns<ClientRow[]>(),
    fetchSalesTeam(supabase),
    getCurrentProfile(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/hub"
          className="flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Hub
        </Link>
        <Link href="/clients/report" className="text-sm font-medium text-accent hover:text-accent-hover">
          Win rate report
        </Link>
      </div>

      <h1 className="mb-6 text-3xl font-bold text-ink">Clients</h1>

      <Panel className="p-4">
        <ClientsList clients={clients ?? []} salesTeam={salesTeam} currentUserId={profile.id} />
      </Panel>
    </div>
  );
}
