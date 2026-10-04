// The Hub's top bar (logo, menu, + New, Settings, Notifications, Profile)
// for the apps that have their own layout - Jobs, Orders, Fleet, Timesheets
// admin, Costing and Site Measures - so every page has the same menu.
import { navForViewer } from "@/lib/nav";
import { TopBar } from "./TopBar";
import { DASHBOARD_THEME } from "./parts";
import { dashboardFontClass } from "./fonts";

export async function HubTopBar({ activeHref }: { activeHref: string }) {
  const items = await navForViewer();
  return (
    <div className={`${dashboardFontClass} sticky top-0 z-20 print:hidden`} style={DASHBOARD_THEME}>
      <TopBar items={items} activeHref={activeHref} />
    </div>
  );
}
