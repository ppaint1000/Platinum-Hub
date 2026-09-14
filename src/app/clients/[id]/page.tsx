import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { Panel } from "@/components/ui";
import { ClientDetail, type ClientDetailRow, type ContactRow } from "@/components/clients/ClientDetail";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await requireAppAccess("jobs");

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, notes")
    .eq("id", id)
    .single<ClientDetailRow>();

  if (!client) notFound();

  const [{ data: contacts }, { data: jobs }] = await Promise.all([
    supabase
      .from("client_contacts")
      .select("id, name, email, phone, job_id")
      .eq("client_id", id)
      .order("name")
      .returns<ContactRow[]>(),
    supabase
      .from("jobs")
      .select("id, job_number, name")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .returns<{ id: string; job_number: string | null; name: string }[]>(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl p-8">
      <Link
        href="/clients"
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Clients
      </Link>

      <Panel className="p-4">
        <ClientDetail client={client} contacts={contacts ?? []} jobs={jobs ?? []} />
      </Panel>
    </div>
  );
}
