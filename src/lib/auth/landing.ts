// Where a signed-in user lands: after sign-in, and on a bare visit to "/".
// It's their "Default app" on the Users page - whatever is picked there.
// If it's an app they can't open (e.g. unticked since), they get
// Timesheets instead.
import { defaultAppAllowed, type AppFlags, type DefaultApp } from "@/lib/users/access";

type LandingAccess = (AppFlags & { sales_authority?: boolean; default_app: string }) | null;

export function landingPath(role: string, access: LandingAccess): string {
  const app = (access?.default_app ?? "timesheets") as DefaultApp;
  const ok = defaultAppAllowed(app, role, access);
  const staffSide = role === "admin" || role === "supervisor";

  if (ok) {
    switch (app) {
      case "dashboard":
        return "/dashboard";
      case "hub":
        return "/hub";
      case "production":
        return "/production";
      case "sales":
        // The whole team's figures for admins and sales authority, your own
        // otherwise.
        return role === "admin" || access?.sales_authority ? "/sales" : "/sales/dashboard";
      case "jobs":
        return "/jobs";
      case "costing":
        return "/costing";
      case "measures":
        return "/site-measures";
      case "orders":
        return "/orders";
      case "fleet":
        return "/fleet";
      case "timesheets":
        break;
    }
  }
  return staffSide ? "/timesheets/admin" : "/timesheets/clock";
}
