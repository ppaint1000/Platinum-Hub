// Marketing: body corporate / building managers to target, a portfolio of
// buildings we've painted (photos, linked to the company that manages them),
// and emails sent to a ticked list of managers. Admins only.
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { DashboardShell } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { MarketingManager, type MarketingData } from "@/components/marketing/MarketingManager";

export const metadata: Metadata = { title: "Marketing · Platinum Hub" };
// Sending a campaign emails each contact in turn.
export const maxDuration = 120;

export default async function MarketingPage() {
  const supabase = await requireAdmin();
  const [companies, contacts, buildings, campaigns] = await Promise.all([
    supabase.from("marketing_companies").select("id, name, phone, email, address, website, notes").order("name"),
    supabase
      .from("marketing_contacts")
      .select("id, company_id, name, role, phone, email, notes, status, last_contacted, follow_up, unsubscribed")
      .order("name"),
    supabase
      .from("marketing_buildings")
      .select("id, name, address, company_id, year_painted, description, photos, featured")
      .order("created_at", { ascending: false }),
    supabase.from("marketing_campaigns").select("id, subject, sent_count, failed_count, sent_at").not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(30),
  ]);

  const data: MarketingData = {
    companies: companies.data ?? [],
    contacts: contacts.data ?? [],
    buildings: buildings.data ?? [],
    campaigns: campaigns.data ?? [],
    todayKey: nzTodayDateString(),
  };

  return (
    <DashboardShell fontClass={dashboardFontClass} topBar={<TopBar items={ADMIN_NAV} activeHref="/marketing" />} todayKey={nzTodayDateString()} title="Marketing">
      {companies.error ? (
        <p className="rounded-lg border border-[#E3E1DA] bg-white p-4 text-sm">Marketing needs its database script (supabase/marketing.sql) run first.</p>
      ) : (
        <MarketingManager data={data} />
      )}
    </DashboardShell>
  );
}
