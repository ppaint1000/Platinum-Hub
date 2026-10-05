// The Health & safety report forms (like HazardCo's): each one a list of
// sections and questions. A report saves its answers by question key (see
// safety_reports.data), so wording can change without losing old answers.

export type RiskLevel = "low" | "medium" | "high" | "extreme";
export const RISK_LEVELS: { value: RiskLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "extreme", label: "Extreme" },
];

export type Field =
  | { kind: "text" | "textarea" | "time"; key: string; label: string; required?: boolean; hint?: string }
  | { kind: "select"; key: string; label: string; options: string[]; required?: boolean }
  // Each item answered Yes / No / N/A.
  | { kind: "checklist"; key: string; label: string; items: string[] }
  // Tick any that apply.
  | { kind: "ticks"; key: string; label: string; items: string[] }
  // A list of names (who was there / who signed on).
  | { kind: "people"; key: string; label: string; hint?: string }
  // Rows of step / hazard / controls / risk.
  | { kind: "risks"; key: string; label: string; stepLabel: string };

export type ReportForm = {
  type: string;
  title: string;
  description: string;
  // The answer shown in lists to tell reports apart.
  summaryKey: string;
  sections: { title: string; fields: Field[] }[];
};

const PPE = ["Safety glasses", "Dust mask / respirator", "Gloves", "Hi-vis", "Safety boots", "Harness", "Hearing protection", "Hard hat", "Sunscreen / hat"];

export const REPORT_FORMS: ReportForm[] = [
  {
    type: "task_analysis",
    title: "Task Analysis (TA)",
    description: "Before starting a job or task: the steps, what could go wrong, and how it's controlled. Everyone doing the work signs on.",
    summaryKey: "task",
    sections: [
      {
        title: "The task",
        fields: [
          { kind: "text", key: "task", label: "Task or job being done", required: true },
          { kind: "risks", key: "steps", label: "Steps, hazards and controls", stepLabel: "Step" },
          { kind: "ticks", key: "ppe", label: "PPE needed", items: PPE },
        ],
      },
      { title: "Signed on", fields: [{ kind: "people", key: "people", label: "Everyone doing the task", hint: "Each person has read and understood this TA" }] },
    ],
  },
  {
    type: "risk_assessment",
    title: "Risk Assessment",
    description: "Look at an activity or area, rate each hazard before and after controls.",
    summaryKey: "activity",
    sections: [
      {
        title: "Assessment",
        fields: [
          { kind: "text", key: "activity", label: "Activity or area assessed", required: true },
          { kind: "risks", key: "hazards", label: "Hazards", stepLabel: "Hazard" },
          { kind: "textarea", key: "further_actions", label: "Further actions needed" },
        ],
      },
    ],
  },
  {
    type: "site_review",
    title: "Site Review",
    description: "A walk around the site to check it's safe and tidy.",
    summaryKey: "reviewed_by_note",
    sections: [
      {
        title: "Checks",
        fields: [
          {
            kind: "checklist",
            key: "checks",
            label: "On site",
            items: [
              "Site tidy, rubbish removed",
              "Safe access and exits",
              "Ladders in good condition and secured",
              "Scaffold tagged and inspected",
              "Edge protection / fall prevention in place",
              "PPE being worn",
              "Paints and solvents stored safely, SDS on site",
              "Drop sheets and trip hazards managed",
              "Power leads and tools tested and tagged",
              "First aid kit on site",
              "Fire extinguisher on site",
              "Signage up, public kept clear",
            ],
          },
          { kind: "textarea", key: "reviewed_by_note", label: "Notes" },
          { kind: "textarea", key: "actions", label: "Actions needed (who and by when)" },
        ],
      },
    ],
  },
  {
    type: "toolbox",
    title: "Toolbox Meeting",
    description: "A quick team talk about safety on the job - what was covered and who was there.",
    summaryKey: "topics",
    sections: [
      {
        title: "Meeting",
        fields: [
          { kind: "textarea", key: "topics", label: "Topics discussed", required: true },
          { kind: "textarea", key: "issues", label: "Issues raised by the team" },
          { kind: "textarea", key: "actions", label: "Actions agreed" },
          { kind: "people", key: "attendees", label: "Who attended" },
        ],
      },
    ],
  },
  {
    type: "plant_prestart",
    title: "Plant / Equipment Pre-Start",
    description: "Check an EWP, scissor lift, water blaster, sprayer or other plant before using it.",
    summaryKey: "equipment",
    sections: [
      {
        title: "Equipment",
        fields: [
          { kind: "text", key: "equipment", label: "Equipment (and rego / serial)", required: true },
          {
            kind: "checklist",
            key: "checks",
            label: "Checks",
            items: [
              "Operator trained / licensed for it",
              "No visible damage or leaks",
              "Hoses, cables and fittings OK",
              "Guards and safety devices working",
              "Emergency stop / lowering works",
              "Tyres, outriggers and platform OK",
              "Inspection tag / certificate current",
              "Ground firm and level, area clear",
            ],
          },
          { kind: "select", key: "ok_to_use", label: "OK to use?", options: ["Yes", "No - tagged out"], required: true },
          { kind: "textarea", key: "faults", label: "Faults found" },
        ],
      },
    ],
  },
  {
    type: "incident",
    title: "Incident Report",
    description: "An injury, near miss, damage or illness at work. Report it straight away - the office is told.",
    summaryKey: "what_happened",
    sections: [
      {
        title: "What happened",
        fields: [
          { kind: "time", key: "time", label: "Time it happened" },
          {
            kind: "select",
            key: "incident_type",
            label: "Type",
            options: ["Injury", "Near miss", "Property damage", "Illness", "Environmental (spill)", "Vehicle"],
            required: true,
          },
          { kind: "people", key: "people_involved", label: "People involved" },
          { kind: "textarea", key: "what_happened", label: "What happened", required: true },
          { kind: "textarea", key: "injury", label: "Injury or damage (what and where)" },
          { kind: "select", key: "treatment", label: "Treatment received", options: ["None", "First aid on site", "Doctor / medical centre", "Hospital"] },
          { kind: "people", key: "witnesses", label: "Witnesses" },
        ],
      },
      {
        title: "Afterwards",
        fields: [
          { kind: "textarea", key: "immediate_actions", label: "What was done straight away" },
          { kind: "textarea", key: "prevent", label: "How we stop it happening again" },
          {
            kind: "select",
            key: "notifiable",
            label: "Notifiable to WorkSafe?",
            options: ["No", "Yes - notified", "Yes - not yet notified", "Not sure"],
          },
        ],
      },
    ],
  },
  {
    type: "vehicle_check",
    title: "Vehicle Checklist",
    description: "A check of a work vehicle before it's used.",
    summaryKey: "vehicle",
    sections: [
      {
        title: "Vehicle",
        fields: [
          { kind: "text", key: "vehicle", label: "Vehicle (rego)", required: true },
          { kind: "text", key: "odometer", label: "Odometer (km)" },
          {
            kind: "checklist",
            key: "checks",
            label: "Checks",
            items: ["Tyres and tread", "Lights and indicators", "Wipers and windscreen", "Oil and coolant", "Brakes", "Load and ladders secured", "WOF and rego current", "First aid kit and extinguisher", "Clean and tidy"],
          },
          { kind: "textarea", key: "faults", label: "Faults to fix" },
        ],
      },
    ],
  },
  {
    type: "site_induction",
    title: "Site Induction",
    description: "Taking a new worker or subbie through the site before they start.",
    summaryKey: "person",
    sections: [
      {
        title: "Induction",
        fields: [
          { kind: "text", key: "person", label: "Person inducted", required: true },
          { kind: "text", key: "company", label: "Company (if a subbie)" },
          {
            kind: "ticks",
            key: "covered",
            label: "Covered",
            items: [
              "Site hazards and controls",
              "Emergency procedures and assembly point",
              "First aid kit and first aider",
              "Toilets and facilities",
              "PPE required",
              "Hazardous substances and SDS",
              "Reporting incidents and hazards",
              "Site rules and hours",
            ],
          },
          { kind: "textarea", key: "notes", label: "Notes" },
        ],
      },
    ],
  },
];

export function reportForm(type: string): ReportForm | null {
  return REPORT_FORMS.find((f) => f.type === type) ?? null;
}

export type RiskRow = { step: string; hazard: string; controls: string; risk: RiskLevel | "" };
export type ReportData = Record<string, unknown>;

export function summaryOf(type: string, data: ReportData): string {
  const form = reportForm(type);
  const v = form ? data[form.summaryKey] : null;
  const text = typeof v === "string" ? v.trim() : "";
  return text.length > 90 ? text.slice(0, 88) + "…" : text;
}

// The required questions left blank, by label.
export function missingRequired(form: ReportForm, data: ReportData): string[] {
  return form.sections
    .flatMap((s) => s.fields)
    .filter((f) => "required" in f && f.required)
    .filter((f) => {
      const v = data[f.key];
      return typeof v !== "string" || !v.trim();
    })
    .map((f) => f.label);
}

export const DOC_CATEGORIES = [
  { value: "general", label: "General H&S" },
  { value: "hazard", label: "Hazard management" },
  { value: "accident", label: "Accidents and incidents" },
  { value: "worker", label: "Worker info" },
  { value: "contractor", label: "Contractor info" },
  { value: "other", label: "Other" },
] as const;
