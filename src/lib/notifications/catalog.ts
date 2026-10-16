// Every notification the Hub sends, for the Notifications page and the
// senders. Emails can be turned on or off per person (and some have an
// option, e.g. my quotes / all quotes); the defaults below apply until
// someone changes theirs. Alerts inside the Hub are listed too, but they're
// always on - they're where the work gets done.

export type Audience = "admin" | "sales" | "supervisor";

export type ScopeOption = { value: string; label: string };

export type EmailNotification = {
  key: string;
  group: string;
  label: string;
  description: string;
  // Who can choose to get it.
  audiences: Audience[];
  // On unless the person turns it off.
  defaultOn: Partial<Record<Audience, boolean>>;
  options?: ScopeOption[];
  defaultScope?: Partial<Record<Audience, string>>;
  // Also always goes to this fixed address (set on the server), whatever
  // anyone picks - so payroll never misses it.
  alsoFixedAddress?: boolean;
};

export type HubAlert = { group: string; label: string; where: string; audiences: Audience[] };

const MINE_ALL: ScopeOption[] = [
  { value: "mine", label: "My quotes" },
  { value: "all", label: "All quotes" },
];

export const EMAIL_NOTIFICATIONS: EmailNotification[] = [
  {
    key: "proposal_sent",
    group: "Quotes & proposals",
    label: "When a proposal link is sent",
    description: "A reminder to follow up, with the customer's link.",
    audiences: ["admin", "sales"],
    defaultOn: { admin: true, sales: false },
    options: MINE_ALL,
    defaultScope: { admin: "all", sales: "mine" },
  },
  {
    key: "proposal_viewed",
    group: "Quotes & proposals",
    label: "When a customer opens a proposal",
    description: "Sales staff hear about their own quotes; admins about all of them.",
    audiences: ["admin", "sales"],
    defaultOn: { admin: false, sales: true },
    options: [
      { value: "first", label: "First view only" },
      { value: "each", label: "Each view" },
    ],
    defaultScope: { admin: "first", sales: "first" },
  },
  {
    key: "proposal_accepted",
    group: "Quotes & proposals",
    label: "When a proposal is accepted",
    description: "The customer signed online - the job is marked Won.",
    audiences: ["admin", "sales"],
    defaultOn: { admin: true, sales: true },
    options: MINE_ALL,
    defaultScope: { admin: "all", sales: "mine" },
  },
  {
    key: "proposal_declined",
    group: "Quotes & proposals",
    label: "When a customer declines a proposal",
    description: "They said online they're not going ahead, and why - the job is marked Lost.",
    audiences: ["admin", "sales"],
    defaultOn: { admin: true, sales: true },
    options: MINE_ALL,
    defaultScope: { admin: "all", sales: "mine" },
  },
  {
    key: "proposal_follow_up",
    group: "Quotes & proposals",
    label: "When a proposal needs following up",
    description: "Sent but not opened after 3 days, or opened but not accepted after 7 days - once each.",
    audiences: ["admin", "sales"],
    defaultOn: { admin: true, sales: true },
    options: MINE_ALL,
    defaultScope: { admin: "all", sales: "mine" },
  },
  {
    key: "client_reminder_due",
    group: "Quotes & proposals",
    label: "When a repaint or check-up reminder is due",
    description: "A client's reminder (Reminders page) has come round - a good time to call them.",
    audiences: ["admin", "sales"],
    defaultOn: { admin: true, sales: false },
    options: [
      { value: "mine", label: "My clients" },
      { value: "all", label: "All clients" },
    ],
    defaultScope: { admin: "all", sales: "mine" },
  },
  {
    key: "job_completed",
    group: "Jobs & production",
    label: "When a job is completed",
    description: "Moved to Job completed on the Production board - ready to invoice.",
    audiences: ["admin", "supervisor"],
    defaultOn: { admin: true, supervisor: false },
  },
  {
    key: "safety_incident",
    group: "Jobs & production",
    label: "When an incident is reported",
    description: "An injury, near miss or damage reported under Health & safety.",
    audiences: ["admin", "supervisor"],
    defaultOn: { admin: true, supervisor: true },
  },
  {
    key: "timesheet_change_request",
    group: "Timesheets",
    label: "When someone asks to change a timesheet",
    description: "A painter has requested a correction to a shift.",
    audiences: ["admin", "supervisor"],
    defaultOn: { admin: false, supervisor: false },
    alsoFixedAddress: true,
  },
  {
    key: "timesheet_confirmed",
    group: "Timesheets",
    label: "When someone confirms their week",
    description: "A painter has confirmed their timesheet for the week.",
    audiences: ["admin", "supervisor"],
    defaultOn: { admin: false, supervisor: false },
    alsoFixedAddress: true,
  },
  {
    key: "clock_out_note",
    group: "Timesheets",
    label: "When someone leaves a note at clock-out",
    description: "A painter wrote a note when clocking off - the note, who and which site.",
    audiences: ["admin", "supervisor"],
    defaultOn: { admin: true, supervisor: true },
  },
  {
    key: "staff_reply",
    group: "Timesheets",
    label: "When someone replies to the clock-on reminder",
    description: "They tapped 'I'm sick today', 'On leave', 'Rained off' or 'Running late' in the 8am email (absences are recorded for you).",
    audiences: ["admin", "supervisor"],
    defaultOn: { admin: true, supervisor: true },
  },
  {
    key: "weekly_timesheet_report",
    group: "Timesheets",
    label: "Weekly timesheet report",
    description: "Last week's hours for everyone, each Monday (when turned on under Timesheets → Reports).",
    audiences: ["admin"],
    defaultOn: { admin: false },
    alsoFixedAddress: true,
  },
  {
    key: "daily_alerts",
    group: "Reports",
    label: "Daily alerts",
    description: "7am on working days, only when something needs a look: no new enquiries for a week, win rate dropping, a job over budget, finished but not invoiced, someone still clocked on. Each one is sent once.",
    audiences: ["admin"],
    defaultOn: { admin: true },
  },
  {
    key: "weekly_xero_timesheets",
    group: "Reports",
    label: "Monday: last week's timesheets sent to Xero",
    description: "Hours go to Xero as drafts automatically each Monday at 7am - this is the summary, with anything worth checking before you approve.",
    audiences: ["admin"],
    defaultOn: { admin: true },
  },
  {
    key: "weekly_budget_trend",
    group: "Reports",
    label: "Monday: jobs to watch on budget",
    description: "Live jobs at 80% or more of their budget, or that used 15% or more of it in the past week.",
    audiences: ["admin"],
    defaultOn: { admin: true },
  },
  {
    key: "monthly_report",
    group: "Reports",
    label: "Monthly business report",
    description: "On the 1st: last month's enquiries, quotes, wins, claims, hours and absences against the month before.",
    audiences: ["admin"],
    defaultOn: { admin: true },
  },
  {
    key: "fuel_missing_numbers",
    group: "Fleet",
    label: "When a fuel entry is missing its numbers",
    description: "A driver couldn't read the litres, cost or odometer off the receipt.",
    audiences: ["admin"],
    defaultOn: { admin: true },
  },
  {
    key: "fuel_unusual",
    group: "Fleet",
    label: "When a vehicle's fuel cost per km is unusual",
    description: "More than the usual amount above or below its average - worth a check.",
    audiences: ["admin"],
    defaultOn: { admin: true },
  },
  {
    key: "fleet_ruc_due",
    group: "Fleet",
    label: "When a diesel's road user charges (RUC) are about to run out",
    description:
      "About a week before, going by the km the vehicle usually does - and again if they run out. Always goes to shelley@platinumpainters.co.nz too.",
    audiences: ["admin"],
    defaultOn: { admin: false },
  },
  {
    key: "security_new_device",
    group: "Security",
    label: "When someone signs in on a new device",
    description:
      "A phone or computer they haven't used for the Hub before - with the device, the rough place and the time. See Users → Sign-in log.",
    audiences: ["admin"],
    defaultOn: { admin: true },
  },
];

export const HUB_ALERTS: HubAlert[] = [
  { group: "Quotes & proposals", label: "Quotes waiting 30+ days to follow up", where: "Sales → Awaiting reply", audiences: ["admin", "sales"] },
  { group: "Quotes & proposals", label: "Proposal opened, sent and accepted", where: "Sales → Activity and Awaiting reply", audiences: ["admin", "sales"] },
  { group: "Quotes & proposals", label: "Quotes undecided for 8 months go On Hold", where: "Jobs → On hold", audiences: ["admin"] },
  { group: "Jobs & production", label: "Jobs ready to invoice", where: "Red banner on the Hub, red count on Production", audiences: ["admin"] },
  { group: "Jobs & production", label: "Timesheet hours waiting for approval", where: "Red count on Jobs, Hours to approve", audiences: ["admin"] },
  { group: "Jobs & production", label: "Jobs brought across with no salesperson", where: "Jobs list and the job's page", audiences: ["admin"] },
  { group: "Timesheets", label: "Staff not clocked in by 9am on a weekday", where: "Red count on Absences", audiences: ["admin"] },
  { group: "Timesheets", label: "Staff get an email at 8am to clock on, and at 4:30pm if still clocked on (working days)", where: "Their own inbox", audiences: ["admin", "supervisor"] },
  { group: "Timesheets", label: "Painters with job hours but no hourly rate", where: "Red count on Users, Hours to approve", audiences: ["admin"] },
  { group: "Fleet", label: "WOF, rego and services due; fuel entries missing numbers", where: "Fleet → Needs attention", audiences: ["admin"] },
  { group: "Fleet", label: "Vehicles more than 10% off the fleet average", where: "Fleet → Kilometres and fuel by vehicle", audiences: ["admin"] },
];

export const GROUP_ORDER = ["Quotes & proposals", "Jobs & production", "Timesheets", "Reports", "Fleet"];

export function notificationByKey(key: string) {
  return EMAIL_NOTIFICATIONS.find((n) => n.key === key) ?? null;
}
