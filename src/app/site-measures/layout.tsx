import { AdminShell } from "@/components/quotes/AdminShell";
import { requireMcAccess } from "@/lib/quotes/mcAccess";
import { HubTopBar } from "@/components/dashboard/HubTopBar";

export default async function SiteMeasuresLayout({ children }: { children: React.ReactNode }) {
  const access = await requireMcAccess("measures");
  return (
    <>
      <HubTopBar activeHref="/site-measures" />
      <AdminShell access={access}>{children}</AdminShell>
    </>
  );
}
