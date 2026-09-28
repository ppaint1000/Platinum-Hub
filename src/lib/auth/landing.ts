// Where a signed-in user lands: after sign-in, and on a bare visit to "/".
//
// Admins land on the Dashboard, and sales staff on their own sales
// dashboard. Everyone else keeps their own default app
// (user_app_access.default_app, set on the Users page), falling back to
// Timesheets. Painters never land on the Hub, even if their default_app says
// "hub" - they only use the apps they've been given (Timesheets, fuel entry).

type LandingAccess = {
  fleet: boolean;
  orders: boolean;
  jobs: boolean;
  sales: boolean;
  default_app: string;
} | null;

export function landingPath(role: string, access: LandingAccess): string {
  if (role === "admin") return "/dashboard";
  if (role === "sales" && access?.sales) return "/sales/dashboard";

  const defaultApp = access?.default_app ?? "timesheets";

  if (defaultApp === "hub" && role !== "painter") return "/hub";
  if (defaultApp === "fleet" && access?.fleet) return "/fleet";
  if (defaultApp === "orders" && access?.orders) return "/orders";
  if (defaultApp === "jobs" && access?.jobs) return "/jobs";
  if (defaultApp === "sales" && access?.sales) return "/sales";

  // default_app === "timesheets", or pointed at an app the user no longer
  // has (flag revoked after being set as default).
  return role === "supervisor" ? "/timesheets/admin" : "/timesheets/clock";
}
