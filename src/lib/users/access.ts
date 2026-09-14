export type AccessApp = "timesheets" | "fleet" | "orders" | "jobs" | "sales";
export type DefaultApp = "hub" | AccessApp;
export type Role = "admin" | "supervisor" | "painter" | "sales";

export function defaultAccessForRole(role: Role): Record<AccessApp, boolean> {
  if (role === "admin")
    return { timesheets: true, fleet: true, orders: true, jobs: true, sales: true };
  if (role === "supervisor")
    return { timesheets: true, fleet: true, orders: true, jobs: false, sales: false };
  if (role === "sales")
    return { timesheets: true, fleet: true, orders: false, jobs: false, sales: true };
  return { timesheets: true, fleet: false, orders: false, jobs: false, sales: false };
}
