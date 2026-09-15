// Users — add, deactivate, or delete staff, and set which apps (and which
// one they land on after signing in) each person can reach. Admin-only.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { Panel } from "@/components/ui";
import { UsersTable, type UserRow } from "@/components/users/UsersTable";
import { NewUserForm } from "@/components/users/NewUserForm";

export default async function UsersPage() {
  const supabase = await requireAdmin();

  const { data: profiles } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role, is_active, user_app_access(timesheets, fleet, orders, jobs, sales, sales_authority, default_app)"
    )
    .is("deleted_at", null)
    .order("is_active", { ascending: false })
    .order("full_name")
    .returns<UserRow[]>();

  const rows = profiles ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl p-8">
      <Link
        href="/hub"
        className="mb-4 flex items-center gap-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Hub
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink">Users</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {rows.length} {rows.length === 1 ? "person" : "people"}
          </p>
        </div>
        <NewUserForm />
      </div>

      <Panel className="p-4">
        <UsersTable users={rows} />
      </Panel>
    </div>
  );
}
