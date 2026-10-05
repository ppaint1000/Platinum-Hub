// Drips (like DripJobs): the automatic customer emails - what's sent at
// each stage and when, your Google review link, who's on a sequence now,
// and what's been sent. Admins only.
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { DashboardShell } from "@/components/dashboard/parts";
import { ADMIN_NAV, TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";
import { DripsManager, type DripData } from "@/components/drips/DripsManager";

export const metadata: Metadata = { title: "Drips · Platinum Hub" };

export default async function DripsPage() {
  const supabase = await requireAdmin();
  const [settingsRes, seqRes, stepsRes, activeRes, sendsRes] = await Promise.all([
    supabase.from("drip_settings").select("google_review_url, paused").maybeSingle(),
    supabase.from("drip_sequences").select("id, trigger, name, description, active").order("created_at"),
    supabase.from("drip_steps").select("id, sequence_id, step_order, delay_days, subject, body").order("step_order"),
    supabase
      .from("drip_enrolments")
      .select("id, sequence_id, email, name, next_step, next_send_at")
      .eq("status", "active")
      .order("next_send_at")
      .limit(100),
    supabase.from("drip_sends").select("id, to_email, subject, sent, error, sent_at").order("sent_at", { ascending: false }).limit(50),
  ]);

  const data: DripData = {
    reviewUrl: settingsRes.data?.google_review_url ?? "",
    paused: settingsRes.data?.paused ?? false,
    sequences: (seqRes.data ?? []).map((s) => ({ ...s, steps: (stepsRes.data ?? []).filter((t) => t.sequence_id === s.id) })),
    active: activeRes.data ?? [],
    sends: sendsRes.data ?? [],
  };

  return (
    <DashboardShell fontClass={dashboardFontClass} topBar={<TopBar items={ADMIN_NAV} activeHref="/clients" />} todayKey={nzTodayDateString()} title="Drips & Google reviews">
      {seqRes.error ? (
        <p className="rounded-lg border border-[#E3E1DA] bg-white p-4 text-sm">Drips need their database script (drips.sql) run first.</p>
      ) : (
        <DripsManager data={data} />
      )}
    </DashboardShell>
  );
}
