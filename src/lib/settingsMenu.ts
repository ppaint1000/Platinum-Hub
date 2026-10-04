// Every set-up page in the Hub, in one place (like PaintScout's Settings).
// The pages themselves stay where they are - this is the menu over them,
// and the "Settings ›" bar shown on each (see AreaCrumb). Reports are
// gathered the same way on /reports (lib/reports/build.ts).
//
// who: "all" = everyone signed in, "staff" = admins and supervisors,
// "admin" = admins only (the pages check this again themselves).

export type SettingsItem = {
  href: string;
  label: string;
  description: string;
  who: "all" | "staff" | "admin";
};

export type SettingsGroup = { title: string; items: SettingsItem[] };

export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    title: "You",
    items: [
      { href: "/profile", label: "My profile", description: "Your photo, phone, title, signature and password.", who: "all" },
      { href: "/notifications", label: "Notifications", description: "Which emails you get from the Hub.", who: "all" },
    ],
  },
  {
    title: "People and access",
    items: [
      { href: "/users", label: "Users and access", description: "Add and manage staff: roles, apps, landing page, pay rates, invites and passwords.", who: "admin" },
      { href: "/timesheets/admin/staff-types", label: "Staff types", description: "The kinds of staff (painter, apprentice…).", who: "admin" },
    ],
  },
  {
    title: "Pricing and costing",
    items: [
      { href: "/settings/rates", label: "Rates", description: "Labour, paint, markups, GST and the other standard rates.", who: "admin" },
      { href: "/settings/production-rates", label: "Production rates", description: "How fast each surface is painted and prepped.", who: "admin" },
      { href: "/settings/paint-products", label: "Paint products", description: "Paints used on costings, and the default.", who: "admin" },
      { href: "/settings/resene-prices", label: "Resene paint prices", description: "Prices from the Resene invoices, with hand corrections.", who: "admin" },
      { href: "/settings/access-equipment", label: "Access equipment", description: "Scaffold and machine hire rates.", who: "admin" },
    ],
  },
  {
    title: "Proposals",
    items: [
      { href: "/settings/proposal-templates", label: "Proposal templates", description: "Letter, photos, methodology, terms and back pages.", who: "admin" },
    ],
  },
  {
    title: "Sales and jobs",
    items: [
      { href: "/sales/budgets", label: "Sales budgets", description: "Each salesperson's monthly quoted and won budget.", who: "admin" },
      { href: "/production/checklists", label: "Job checklists", description: "Pre-job and post-job checklist items.", who: "admin" },
    ],
  },
  {
    title: "Timesheets",
    items: [
      { href: "/timesheets/admin/sites", label: "Sites", description: "Where painters clock in - each belongs to a client and a job.", who: "staff" },
    ],
  },
  {
    title: "Fleet",
    items: [
      { href: "/fleet/vehicles", label: "Vehicles", description: "The vans and utes, rego and service details.", who: "staff" },
      { href: "/fleet/drivers", label: "Drivers", description: "Who drives which vehicle.", who: "staff" },
    ],
  },
];

export function canSee(item: SettingsItem, role: string) {
  if (item.who === "all") return true;
  if (item.who === "staff") return role === "admin" || role === "supervisor";
  return role === "admin";
}
