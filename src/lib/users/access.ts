export type AccessApp = "timesheets" | "fleet" | "orders" | "jobs" | "sales";
export type Role = "admin" | "supervisor" | "painter" | "sales";

// Where someone lands after signing in - the "Default app" on the Users
// page. Whatever is picked there is where they go (see landingPath).
export type DefaultApp =
  | "hub"
  | "dashboard"
  | "timesheets"
  | "production"
  | "sales"
  | "jobs"
  | "costing"
  | "measures"
  | "orders"
  | "fleet";

export const DEFAULT_APP_OPTIONS: { value: DefaultApp; label: string }[] = [
  { value: "dashboard", label: "Dashboard" },
  { value: "hub", label: "Hub home" },
  { value: "timesheets", label: "Timesheets (clock in)" },
  { value: "production", label: "Production board" },
  { value: "sales", label: "Sales" },
  { value: "jobs", label: "Jobs" },
  { value: "costing", label: "Costing" },
  { value: "measures", label: "Site Measures" },
  { value: "orders", label: "Orders" },
  { value: "fleet", label: "Fleet" },
];

// What a new user starts with when you pick their role (you can change it).
export function defaultAppForRole(role: Role): DefaultApp {
  if (role === "admin") return "dashboard";
  if (role === "supervisor") return "production";
  if (role === "sales") return "sales";
  return "timesheets";
}

export type AppFlags = Partial<Record<AccessApp | "measures" | "costing", boolean>>;

// Whether `app` can be someone's landing page: they need to be able to open
// it. Painters never land on the Hub home or the admin pages.
export function defaultAppAllowed(app: DefaultApp, role: string, flags: AppFlags | null | undefined): boolean {
  const admin = role === "admin";
  switch (app) {
    case "dashboard":
      return admin;
    case "hub":
      return role !== "painter";
    case "production":
      return admin || role === "supervisor";
    case "timesheets":
    case "sales":
    case "jobs":
    case "orders":
    case "fleet":
    case "costing":
    case "measures":
      return admin || !!flags?.[app];
  }
}

export function defaultAccessForRole(role: Role): Record<AccessApp, boolean> {
  if (role === "admin")
    return { timesheets: true, fleet: true, orders: true, jobs: true, sales: true };
  if (role === "supervisor")
    return { timesheets: true, fleet: true, orders: true, jobs: false, sales: false };
  if (role === "sales")
    return { timesheets: true, fleet: true, orders: false, jobs: false, sales: true };
  return { timesheets: true, fleet: false, orders: false, jobs: false, sales: false };
}
