// Health & safety → Toolbox: toolbox / safety meetings with a bank of
// topic ideas and tap-to-tick attendance. Supervisors and admins only -
// anyone else is sent back to the Health & safety overview.
import { redirect } from "next/navigation";
import { safetyContext, safetySites } from "@/lib/safety/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { SafetyToolbox, type ToolboxMeeting } from "@/components/safety/SafetyToolbox";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

// Everyone active who's on timesheets (Users → Timesheets ticked), with
// their role so the crew and supervisors can be ticked as groups.
async function toolboxStaff(): Promise<{ id: string; full_name: string; role: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, role, user_app_access!inner(timesheets)")
    .eq("user_app_access.timesheets", true)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("full_name")
    .returns<{ id: string; full_name: string; role: string }[]>();
  let rows = data ?? [];
  if (!rows.length) {
    const { data: all } = await admin
      .from("profiles")
      .select("id, full_name, role")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("full_name")
      .returns<{ id: string; full_name: string; role: string }[]>();
    rows = all ?? [];
  }
  return rows.map((p) => ({ id: p.id, full_name: p.full_name.replace(/\s+/g, " ").trim(), role: String(p.role) }));
}

type MeetingRow = Omit<ToolboxMeeting, "attendees"> & { toolbox_attendance: { user_id: string }[] | null };

export default async function SafetyToolboxPage() {
  const { supabase, isManager, userId } = await safetyContext();
  if (!isManager) redirect("/safety");

  const [{ data, error }, staff, sites] = await Promise.all([
    supabase
      .from("toolbox_meetings")
      .select("id, meeting_date, site_id, location, topic, topic_key, talking_points, issues, actions, visitors, led_by, toolbox_attendance(user_id)")
      .order("meeting_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<MeetingRow[]>(),
    toolboxStaff(),
    safetySites(),
  ]);

  if (error) {
    return <p className="text-sm text-[#5B6472]">Toolbox meetings aren&apos;t set up yet - run supabase/safety_toolbox.sql in Supabase.</p>;
  }

  const meetings: ToolboxMeeting[] = (data ?? []).map(({ toolbox_attendance, ...m }) => ({
    ...m,
    visitors: m.visitors ?? [],
    attendees: (toolbox_attendance ?? []).map((a) => a.user_id),
  }));

  // Past meetings can include people who've since left - keep their names.
  const known = new Set(staff.map((s) => s.id));
  const missing = [...new Set(meetings.flatMap((m) => [...m.attendees, m.led_by ?? ""]))].filter((id) => id && !known.has(id));
  let former: { id: string; full_name: string }[] = [];
  if (missing.length) {
    const { data: people } = await createAdminClient()
      .from("profiles")
      .select("id, full_name")
      .in("id", missing)
      .returns<{ id: string; full_name: string }[]>();
    former = people ?? [];
  }

  return (
    <SafetyToolbox
      meetings={meetings}
      staff={staff}
      former={former}
      sites={sites}
      userId={userId}
      today={nzTodayDateString()}
    />
  );
}
