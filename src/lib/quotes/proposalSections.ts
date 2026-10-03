// The sections of a proposal, in their standard order (like the Sunshine
// Terrace quote). Each proposal can switch sections off and move them; the
// cover and acceptance are always there, and pricing can't be left out
// because the customer accepts against it.

export const PROPOSAL_SECTIONS = [
  { key: "letter", label: "Letter" },
  { key: "completed_projects", label: "Completed Projects" },
  { key: "current_condition", label: "Current Condition photos" },
  { key: "site_plan", label: "Site Plan" },
  { key: "equipment", label: "Platinum Painters owned equipment" },
  { key: "extent", label: "Extent of Work" },
  { key: "methodology", label: "Methodology" },
  { key: "specification", label: "Specification" },
  { key: "pricing", label: "Pricing", locked: true },
  { key: "why", label: "Why Platinum Painters" },
  { key: "terms", label: "Terms and Conditions" },
  { key: "back_pages", label: "Pages at the back (certificate)" },
] as const;

export type SectionKey = (typeof PROPOSAL_SECTIONS)[number]["key"];
export type SectionChoice = { key: SectionKey; on: boolean };

const KNOWN = new Set<string>(PROPOSAL_SECTIONS.map((s) => s.key));

export function sectionLabel(key: SectionKey) {
  return PROPOSAL_SECTIONS.find((s) => s.key === key)?.label ?? key;
}

export function isLockedSection(key: SectionKey) {
  return PROPOSAL_SECTIONS.some((s) => s.key === key && "locked" in s && s.locked);
}

// A proposal's saved choices, with any section added since slotted in at
// its standard place (switched on). Nothing saved = the standard order.
export function resolveSections(saved: unknown): SectionChoice[] {
  const list: SectionChoice[] = [];
  const seen = new Set<string>();
  if (Array.isArray(saved)) {
    for (const item of saved) {
      const key = (item as { key?: unknown })?.key;
      if (typeof key !== "string" || !KNOWN.has(key) || seen.has(key)) continue;
      seen.add(key);
      list.push({ key: key as SectionKey, on: (item as { on?: unknown }).on !== false });
    }
  }
  PROPOSAL_SECTIONS.forEach((s, i) => {
    if (seen.has(s.key)) return;
    // After the nearest standard section before it that's already listed.
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = list.findIndex((c) => c.key === PROPOSAL_SECTIONS[j].key);
      if (idx >= 0) {
        at = idx + 1;
        break;
      }
    }
    list.splice(at, 0, { key: s.key, on: true });
  });
  return list.map((c) => (isLockedSection(c.key) ? { ...c, on: true } : c));
}
