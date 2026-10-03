import { AdminShell } from "@/components/quotes/AdminShell";
import { requireMcAccess } from "@/lib/quotes/mcAccess";

export default async function SiteMeasuresLayout({ children }: { children: React.ReactNode }) {
  const access = await requireMcAccess("measures");
  return <AdminShell access={access}>{children}</AdminShell>;
}
