// Health & safety → Toolbox: ideas for toolbox / safety meetings, picked
// for a painting crew (residential, commercial and body corporate work).
// Tapping one fills in the topic and talking points, which can then be
// changed. Drawn from Site Safe's and WorkSafe's toolbox talk topics, and
// the hazards in our own register.

export type ToolboxTopic = {
  key: string;
  group: string;
  title: string;
  points: string[];
};

export const TOOLBOX_GROUPS = [
  "Working at height",
  "Paint, dust and chemicals",
  "Tools and equipment",
  "On site",
  "Health and wellbeing",
  "Our systems",
] as const;

export const TOOLBOX_TOPICS: ToolboxTopic[] = [
  // ── Working at height ──
  {
    key: "ladder_safety",
    group: "Working at height",
    title: "Ladder safety",
    points: [
      "Check the ladder before use - feet, rungs, locks, no damage; tag it out if faulty",
      "Right ladder for the job - height, load rating, step vs extension",
      "1 in 4 angle, footed or tied off, 1 m past the landing",
      "Three points of contact - no overreaching, move the ladder instead",
      "Short-duration, light work only - use a platform or scaffold for longer jobs",
    ],
  },
  {
    key: "scaffold",
    group: "Working at height",
    title: "Scaffold - checks and use",
    points: [
      "Only use scaffold with a current Scafftag / inspection",
      "Don't move or alter planks, ties, guardrails or toe boards - call the scaffolder",
      "Keep platforms clear of paint tins, offcuts and trip hazards",
      "Report any damage or missing parts straight away",
    ],
  },
  {
    key: "mobile_scaffold",
    group: "Working at height",
    title: "Mobile scaffold towers",
    points: [
      "Only trained people put up and move towers",
      "Brakes on and outriggers out before climbing",
      "Never move a tower with anyone or anything on it",
      "Watch for overhead power lines, slopes and soft ground",
    ],
  },
  {
    key: "ewp",
    group: "Working at height",
    title: "EWP / scissor lift / boom lift",
    points: [
      "Operators must hold the right EWP licence",
      "Pre-start checks every day - log it",
      "Harness clipped on in boom lifts",
      "Exclusion zone below, a spotter near power lines and traffic",
      "Rescue plan if the machine fails at height",
    ],
  },
  {
    key: "roof_work",
    group: "Working at height",
    title: "Working on roofs",
    points: [
      "Edge protection or a harness system before anyone goes up",
      "Watch for skylights, fragile sheets and wet or mossy surfaces",
      "Don't work on roofs in rain or high wind",
      "Plan how tools and paint go up and down safely",
    ],
  },
  {
    key: "falling_objects",
    group: "Working at height",
    title: "Dropped tools and falling objects",
    points: [
      "Tool lanyards and tins secured when working above people",
      "Barriers and signs to keep the public out of the drop zone",
      "Nothing left loose on scaffold, planks or roof edges at knock-off",
    ],
  },

  // ── Paint, dust and chemicals ──
  {
    key: "lead_paint",
    group: "Paint, dust and chemicals",
    title: "Lead-based paint",
    points: [
      "Assume older houses (pre-1980s) have lead paint until tested",
      "No dry sanding or heat guns above 450°C - wet sand or use chemical strippers",
      "P2 respirator, disposable overalls, wash hands and face before eating",
      "Contain and collect all flakes and dust - drop sheets, HEPA vac",
      "Keep children, pregnant people and pets away from the work area",
    ],
  },
  {
    key: "silica_dust",
    group: "Paint, dust and chemicals",
    title: "Sanding dust and silica",
    points: [
      "Plaster, concrete and fillers can contain silica - very harmful to lungs",
      "Use dust-extracting sanders and wet methods where you can",
      "P2 mask fitted properly - clean-shaven where the seal sits",
      "Clean up with a vacuum, never dry sweeping or blowing",
    ],
  },
  {
    key: "asbestos",
    group: "Paint, dust and chemicals",
    title: "Asbestos - know when to stop",
    points: [
      "Buildings before 2000 may have asbestos (soffits, textured ceilings, cladding, fibrolite)",
      "Check the asbestos register / survey before starting prep",
      "If you're not sure - stop, don't sand, scrape or water blast, and tell the supervisor",
    ],
  },
  {
    key: "solvents_sds",
    group: "Paint, dust and chemicals",
    title: "Solvents, thinners and Safety Data Sheets",
    points: [
      "Where to find the SDS for every product we use",
      "Ventilation in enclosed spaces - fans, open windows, take breaks",
      "Gloves and eye protection when handling solvents and cleaners",
      "Store and label containers properly - no decanting into drink bottles",
    ],
  },
  {
    key: "spray_painting",
    group: "Paint, dust and chemicals",
    title: "Spray painting and overspray",
    points: [
      "Right respirator with the right cartridges, fit-checked each time",
      "Mask up cars, windows and neighbouring property - check the wind",
      "Airless spray injection injuries - never point the gun at anyone, lock the trigger",
      "Release pressure before cleaning or changing tips",
    ],
  },
  {
    key: "flammables",
    group: "Paint, dust and chemicals",
    title: "Flammables and oily rags",
    points: [
      "Rags with oil-based products can self-ignite - lay flat to dry or soak in water",
      "No smoking or naked flames near paint storage",
      "Know where the fire extinguisher is on site and in the van",
    ],
  },
  {
    key: "ppe",
    group: "Paint, dust and chemicals",
    title: "PPE - using and looking after it",
    points: [
      "What PPE each task needs: masks, glasses, gloves, hearing, hi-vis, boots",
      "Replace mask filters and damaged PPE - ask, don't go without",
      "PPE is the last line of defence - eliminate or control the hazard first",
    ],
  },
  {
    key: "wastewater",
    group: "Paint, dust and chemicals",
    title: "Washing out and paint waste",
    points: [
      "Never wash brushes or rollers into stormwater drains",
      "Use the wash-out system / bucket and dispose of waste correctly",
      "Recycle empty tins through Resene PaintWise",
    ],
  },

  // ── Tools and equipment ──
  {
    key: "water_blaster",
    group: "Tools and equipment",
    title: "Water blasting",
    points: [
      "Only trained people operate the water blaster",
      "Eye protection, gloves and boots - never point the lance at anyone",
      "Watch for electrics, windows, flashings and soft timber",
      "Don't water blast from ladders",
      "Check for lead paint and asbestos before blasting",
    ],
  },
  {
    key: "power_tools",
    group: "Tools and equipment",
    title: "Power tools and leads",
    points: [
      "Test and tag current on tools and leads",
      "Use an RCD on every lead",
      "Keep leads off wet ground and out of walkways",
      "Grinders - guards on, right disc, Site Safe / training required",
    ],
  },
  {
    key: "heat_guns",
    group: "Tools and equipment",
    title: "Heat guns and burning off",
    points: [
      "Fire risk in cavities, soffits and behind weatherboards",
      "Never leave a heat gun running unattended, let it cool before storing",
      "Check for lead paint - no high temperatures on lead",
      "Fire watch after finishing for the day",
    ],
  },
  {
    key: "manual_handling",
    group: "Tools and equipment",
    title: "Lifting and carrying",
    points: [
      "20 L pails, ladders and planks - lift with your legs, get help for heavy loads",
      "Use trolleys and two-person carries for ladders",
      "Plan the route - no carrying loads up ladders",
    ],
  },
  {
    key: "vehicles",
    group: "Tools and equipment",
    title: "Vans, loading and driving",
    points: [
      "Secure ladders and paint before driving - nothing loose in the cab",
      "Daily check: tyres, lights, load; log fuel in the Hub",
      "No phones while driving; drive to the conditions",
      "Reversing on site - use a spotter",
    ],
  },

  // ── On site ──
  {
    key: "site_induction",
    group: "On site",
    title: "Site induction and sign-in",
    points: [
      "Everyone signs in and gets inducted before starting on a new site",
      "Site hazards, emergency exits, first aid and assembly point",
      "Client or building manager rules - access, hours, noise, parking",
    ],
  },
  {
    key: "public_safety",
    group: "On site",
    title: "Residents and the public",
    points: [
      "Body corporate / occupied sites - keep walkways and entrances open and safe",
      "Barriers, cones and wet paint signs",
      "Tidy up at the end of each day - nothing left for kids or residents to trip on",
      "Be polite and professional - we represent Platinum Painters",
    ],
  },
  {
    key: "housekeeping",
    group: "On site",
    title: "Housekeeping, slips and trips",
    points: [
      "Drop sheets taped or weighted - they're a slip hazard",
      "Leads, hoses and tins out of walkways",
      "Clean up spills straight away",
    ],
  },
  {
    key: "electrical",
    group: "On site",
    title: "Power lines and electrical hazards",
    points: [
      "Keep 4 m from overhead power lines - plan ladder and scaffold positions",
      "Isolate or cover switches and sockets before painting around them",
      "Never water blast or spray near live electrics",
    ],
  },
  {
    key: "emergency",
    group: "On site",
    title: "Emergencies and first aid",
    points: [
      "Where's the first aid kit, fire extinguisher and assembly point on this site?",
      "Who are the first aiders today?",
      "Site address ready for 111 - what3words / street number",
    ],
  },
  {
    key: "weather",
    group: "On site",
    title: "Weather - wind and rain",
    points: [
      "Stop ladder and roof work in strong wind",
      "Wet surfaces and scaffold planks are slippery",
      "Secure drop sheets, signs and loose gear before wind picks up",
    ],
  },
  {
    key: "summer_sun",
    group: "On site",
    title: "Summer - sun and heat",
    points: [
      "Slip, slop, slap, wrap - sunscreen, hats, long sleeves, glasses",
      "Drink water through the day; watch for heat stress in workmates",
      "Plan the hottest work for the coolest part of the day",
    ],
  },
  {
    key: "near_miss",
    group: "On site",
    title: "Near misses - why we report them",
    points: [
      "A near miss is a free warning - report it in the Hub",
      "Talk through a recent near miss and what we changed",
      "No blame - we want to fix the cause",
    ],
  },

  // ── Health and wellbeing ──
  {
    key: "fatigue",
    group: "Health and wellbeing",
    title: "Fatigue and long days",
    points: [
      "Tiredness causes mistakes, especially at height and driving",
      "Take your breaks, get enough sleep",
      "Speak up if you're not fit to work safely",
    ],
  },
  {
    key: "mental_health",
    group: "Health and wellbeing",
    title: "Mental health - check in on your mates",
    points: [
      "Construction has high rates of stress - it's OK not to be OK",
      "Signs a workmate might be struggling, and how to ask",
      "Who to talk to: supervisor, 1737 (free call or text), Mates in Construction",
    ],
  },
  {
    key: "drugs_alcohol",
    group: "Health and wellbeing",
    title: "Drugs, alcohol and medication",
    points: [
      "Zero tolerance for being impaired on site",
      "Some prescription and cold medicines cause drowsiness - tell your supervisor",
    ],
  },
  {
    key: "hearing",
    group: "Health and wellbeing",
    title: "Noise and hearing protection",
    points: [
      "Water blasters, sanders and grinders damage hearing over time",
      "Earmuffs or plugs - if you have to shout to be heard, wear them",
    ],
  },
  {
    key: "hygiene",
    group: "Health and wellbeing",
    title: "Hygiene and facilities",
    points: [
      "Wash hands before eating, drinking or smoking",
      "Keep toilets and lunch areas clean",
      "Don't take contaminated overalls home with the family washing",
    ],
  },

  // ── Our systems ──
  {
    key: "hazard_register",
    group: "Our systems",
    title: "Hazards on this job - review the register",
    points: [
      "Walk through the hazards for this site and how we're controlling them",
      "Anything new since we started?",
      "Add new hazards to the register in the Hub",
    ],
  },
  {
    key: "reporting",
    group: "Our systems",
    title: "Reporting incidents and injuries",
    points: [
      "Every injury, however small, gets reported the same day",
      "How to fill in an incident report in the Hub",
      "Notifiable events go to WorkSafe - supervisor handles this",
    ],
  },
  {
    key: "stop_work",
    group: "Our systems",
    title: "Right to stop unsafe work",
    points: [
      "Everyone can stop a job they think is unsafe",
      "Raise it with your supervisor - you won't get in trouble",
      "Your duties under the Health and Safety at Work Act",
    ],
  },
  {
    key: "quality",
    group: "Our systems",
    title: "Quality and the job spec",
    points: [
      "Read the Resene spec / work order before starting",
      "Prep is most of the job - fill, sand, prime as specified",
      "Check the finish before moving off - fix it now, not at handover",
    ],
  },
];
