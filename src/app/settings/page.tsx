// Settings — every set-up page in one place, grouped like PaintScout's
// Settings. The pages stay where they are (see lib/settingsMenu.ts); each
// person only sees the ones they can open.
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { SETTINGS_GROUPS, canSee } from "@/lib/settingsMenu";
import { navForViewer } from "@/lib/nav";
import { DashboardShell } from "@/components/dashboard/parts";
import { TopBar } from "@/components/dashboard/TopBar";
import { dashboardFontClass } from "@/components/dashboard/fonts";
import { nzTodayDateString } from "@/lib/timesheets/formatNZ";

export const metadata: Metadata = { title: "Settings · Platinum Hub" };

export default async function SettingsPage() {
  const [profile, nav] = await Promise.all([getCurrentProfile(), navForViewer()]);
  const groups = SETTINGS_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => canSee(i, profile.role)) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <DashboardShell
      fontClass={dashboardFontClass}
      topBar={<TopBar items={nav} activeHref="/settings" />}
      todayKey={nzTodayDateString()}
      title="Settings"
    >
      <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
        {/* The list down the side, like PaintScout's - jumps to each group. */}
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-24 flex flex-col gap-0.5 rounded-xl border border-[#E3E1DA] bg-white p-2">
            {groups.map((g) => (
              <li key={g.title}>
                <a
                  href={`#${slug(g.title)}`}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-[#16202E] hover:bg-[#F5F4F0]"
                >
                  {g.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <section key={g.title} id={slug(g.title)} aria-label={g.title} className="flex scroll-mt-24 flex-col gap-3">
              <h2 className="text-lg font-bold text-[#16202E]">{g.title}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {g.items.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    className="flex flex-col gap-1 rounded-xl border border-[#E3E1DA] bg-white px-4 py-3.5 transition hover:border-[#9DB6D9] hover:bg-[#F8FAFD]"
                  >
                    <span className="font-semibold text-[#1F4E8C]">{i.label}</span>
                    <span className="text-sm text-[#5B6472]">{i.description}</span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z]+/g, "-");
}
