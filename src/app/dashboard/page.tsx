import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { loadDashboard } from "@/lib/dashboard/data";
import { Dashboard } from "@/components/dashboard/Dashboard";

const displayFont = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display" });
const bodyFont = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

export const metadata: Metadata = { title: "Dashboard · Platinum Hub" };

// Admin-only. The proxy already redirects non-admins away from /dashboard;
// requireAdmin checks again here so the page never renders for anyone else.
export default async function DashboardPage() {
  const supabase = await requireAdmin();
  const data = await loadDashboard(supabase);

  return <Dashboard data={data} fontClass={`${displayFont.variable} ${bodyFont.variable}`} />;
}
