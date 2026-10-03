// Profile — your own photo, name, phone, title, signature and bio, and
// where you change your password. Everyone signed in.
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { navForViewer } from "@/lib/nav";
import type { StaffProfile } from "@/lib/staffProfile";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { DashboardShell } from "@/components/dashboard/parts";
import { TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export const metadata: Metadata = { title: "Profile · Platinum Hub" };

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  const supabase = await createClient();
  const [{ data: details }, { data: me }, nav] = await Promise.all([
    supabase
      .from("staff_profiles")
      .select("phone, title, bio, photo_path, signature_path")
      .eq("user_id", profile.id)
      .maybeSingle<StaffProfile>(),
    supabase.from("profiles").select("email").eq("id", profile.id).maybeSingle<{ email: string | null }>(),
    navForViewer(),
  ]);

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={nav} activeHref="/profile" />}
      todayKey={nzTodayDateString()}
      title="Profile"
    >
      <ProfileForm
        userId={profile.id}
        fullName={profile.full_name}
        email={me?.email ?? null}
        details={details ?? { phone: null, title: null, bio: null, photo_path: null, signature_path: null }}
        // The proposal "Your contact" box is turned off (Costing app).
        showsOnProposals={false}
      />
    </DashboardShell>
  );
}
