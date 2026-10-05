// The Health & safety template library (from HazardCo's list, minus Hot
// Work Permit, Induction (Ag/Hort) and Lift Plan). Where the Hub already
// has the form or register, the card links to it; otherwise an admin can
// upload the template file (e.g. downloaded from HazardCo) for the team.

export type SafetyTemplate = {
  key: string;
  name: string;
  description: string;
  group: string;
  // Where it's done in the Hub, if it is.
  hubHref?: string;
};

export const TEMPLATE_GROUPS = ["Planning and permits", "Checks and pre-starts", "Registers", "People, meetings and incidents"];

export const SAFETY_TEMPLATES: SafetyTemplate[] = [
  // Planning and permits
  { key: "task_analysis", group: "Planning and permits", name: "Task Analysis (TA)", description: "The steps of a task, the hazards in each, the controls and PPE - signed on by the crew before starting.", hubHref: "/safety/reports/new?type=task_analysis" },
  { key: "risk_assessment", group: "Planning and permits", name: "Risk Assessment", description: "Check a work area before work starts so it's safe for everyone.", hubHref: "/safety/reports/new?type=risk_assessment" },
  { key: "permit_to_work", group: "Planning and permits", name: "Permit to Work (PTW)", description: "Issued by whoever's in charge of the site to control and keep track of high-risk work." },
  { key: "confined_space_permit", group: "Planning and permits", name: "Confined Space Permit", description: "Hazards and controls for work in confined spaces like tanks or manholes. Use with a Rescue Plan and TA." },
  { key: "lockout_tagout", group: "Planning and permits", name: "Lock out / Tag out Permit", description: "Make sure equipment is fully shut down and can't be started while it's cleaned or repaired." },
  { key: "rescue_plan", group: "Planning and permits", name: "Rescue Plan", description: "How someone will be rescued during high-risk work such as working at height. Use with a TA or Permit to Work." },
  { key: "emergency_plan", group: "Planning and permits", name: "Emergency Plan", description: "The emergencies that could happen and what to do in each one." },
  { key: "property_emergency_plan", group: "Planning and permits", name: "Property Emergency Plan", description: "An emergency plan for a farm or orchard property." },
  { key: "sop", group: "Planning and permits", name: "Standard Operating Procedure", description: "How to safely use, maintain and train people on a piece of plant, machinery or equipment." },
  { key: "subcontractor_safety_plan", group: "Planning and permits", name: "Subcontractor Safety Plan", description: "Our safety plan to give a main contractor: known risks, emergency procedures and training. Use with a TA." },

  // Checks and pre-starts
  { key: "site_review", group: "Checks and pre-starts", name: "Site / Safety Review", description: "Walk the site, note any health and safety risks and the controls needed.", hubHref: "/safety/reports/new?type=site_review" },
  { key: "prestart_ewp", group: "Checks and pre-starts", name: "Pre-start - Elevating Work Platform (EWP)", description: "Check an EWP or scissor lift works, is in good condition and safe before using it.", hubHref: "/safety/reports/new?type=plant_prestart" },
  { key: "prestart_scaffolding", group: "Checks and pre-starts", name: "Pre-start - Scaffolding", description: "Check scaffolding is set up correctly and safe to use." },
  { key: "prestart_fall_arrest", group: "Checks and pre-starts", name: "Pre-start - Fall Arrest", description: "Check harnesses and fall arrest gear are set up right, undamaged and safe." },
  { key: "ladder_checklist", group: "Checks and pre-starts", name: "Ladder Checklist", description: "Inspect a ladder before it's used." },
  { key: "prestart_electrical", group: "Checks and pre-starts", name: "Pre-start - Electrical tools and equipment", description: "Check power tools and leads are safe, undamaged and fault-free before use." },
  { key: "prestart_heavy_machinery", group: "Checks and pre-starts", name: "Pre-start - Heavy Machinery", description: "Check heavy machinery and attachments are set up right and safe before use.", hubHref: "/safety/reports/new?type=plant_prestart" },
  { key: "prestart_forklift", group: "Checks and pre-starts", name: "Pre-start - Forklift", description: "Check a forklift and its attachments are set up right and safe before use.", hubHref: "/safety/reports/new?type=plant_prestart" },
  { key: "prestart_blank", group: "Checks and pre-starts", name: "Pre-start - Blank checksheet", description: "A blank checksheet to make your own pre-start check." },
  { key: "vehicle_checklist", group: "Checks and pre-starts", name: "Vehicle Checklist", description: "Check a work vehicle before it's used and note anything to fix.", hubHref: "/safety/reports/new?type=vehicle_check" },
  { key: "hs_checklist", group: "Checks and pre-starts", name: "Health and Safety Checklist", description: "Review our health and safety system and spot what could be better." },

  // Registers
  { key: "hazard_register", group: "Registers", name: "Hazard / Risk Register", description: "The common hazards in our work and the controls we use.", hubHref: "/safety/hazards" },
  { key: "hazardous_substances", group: "Registers", name: "Hazardous Substances Inventory", description: "A list of the hazardous substances (paints, solvents, thinners) we use and store." },
  { key: "incident_register", group: "Registers", name: "Incident Register", description: "Every incident that's happened at work.", hubHref: "/safety/incidents" },
  { key: "induction_register", group: "Registers", name: "Induction Register", description: "Everyone who's been inducted onto a site.", hubHref: "/safety/reports?type=site_induction" },
  { key: "training_register", group: "Registers", name: "Training Register", description: "Training each worker has done and what's coming up." },
  { key: "ppe_register", group: "Registers", name: "PPE Register", description: "PPE given to each worker and when it was last checked." },
  { key: "plant_register", group: "Registers", name: "Plant, Machinery and Equipment Register", description: "All the plant, machinery and equipment we use." },
  { key: "contractor_list", group: "Registers", name: "Contractor List", description: "All the contractors working on site.", hubHref: "/safety/contractors" },

  // People, meetings and incidents
  { key: "worker_induction", group: "People, meetings and incidents", name: "Worker Induction", description: "Take a new worker through our health and safety before they start." },
  { key: "site_induction", group: "People, meetings and incidents", name: "Site Induction", description: "Record that anyone coming on site knows the site rules, emergency procedures and safety documents.", hubHref: "/safety/reports/new?type=site_induction" },
  { key: "toolbox", group: "People, meetings and incidents", name: "Toolbox / Safety Meeting", description: "Record what was covered at a team safety meeting and who was there.", hubHref: "/safety/reports/new?type=toolbox" },
  { key: "incident_investigation", group: "People, meetings and incidents", name: "Incident Investigation", description: "Who, what, when, how and why for an injury, incident or near miss.", hubHref: "/safety/reports/new?type=incident" },
  { key: "contractor_prequal", group: "People, meetings and incidents", name: "Contractor Pre-Qualification", description: "Check a contractor has a working health and safety system before they start.", hubHref: "/safety/contractors" },
];
