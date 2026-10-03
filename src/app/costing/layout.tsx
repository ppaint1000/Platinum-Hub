import { AdminShell } from "@/components/quotes/AdminShell";
import { CostingSubNav } from "@/components/quotes/CostingSubNav";
import { requireMcAccess } from "@/lib/quotes/mcAccess";

export default async function CostingLayout({ children }: { children: React.ReactNode }) {
  const access = await requireMcAccess("costing");
  return (
    <AdminShell access={access}>
      <CostingSubNav />
      {children}
    </AdminShell>
  );
}
