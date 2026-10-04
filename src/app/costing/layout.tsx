import { AdminShell } from "@/components/quotes/AdminShell";
import { CostingSubNav } from "@/components/quotes/CostingSubNav";
import { requireMcAccess } from "@/lib/quotes/mcAccess";
import { HubTopBar } from "@/components/dashboard/HubTopBar";

export default async function CostingLayout({ children }: { children: React.ReactNode }) {
  const access = await requireMcAccess("costing");
  return (
    <>
      <HubTopBar activeHref="/costing" />
      <AdminShell access={access}>
        <CostingSubNav />
        {children}
      </AdminShell>
    </>
  );
}
