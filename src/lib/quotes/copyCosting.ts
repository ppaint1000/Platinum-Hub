import { createClient } from "@/lib/supabase/client";

// The quote's own columns worth carrying over to a copy — its details, rates
// and allowances. (Ids and timestamps are left for the database to set.)
const QUOTE_FIELDS = [
  "customer_id",
  "project",
  "notes",
  "discount",
  "subtotal",
  "total",
  "tax_rate",
  "labour_rate_sell",
  "labour_rate_cost",
  "labour_sell_override",
  "labour_cost_override",
  "spread_rate_sqm_per_litre",
  "overtime_pct",
  "overtime_rate",
  "overtime_enabled",
  "repaint_coats",
  "general_prep_rate_sqm_per_hr",
  "markup_material_pct",
  "markup_other_pct",
  "negotiating_factor_pct",
  "gst_pct",
  "allowance_site",
  "allowance_other",
  "schedule_men",
  "schedule_hours_per_week",
] as const;

type Row = Record<string, unknown>;

// Drops the columns the database fills in itself, so a row can be re-inserted.
function fresh(row: Row): Row {
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = row;
  void _id;
  void _c;
  void _u;
  return rest;
}

// "29 Haven Drive" -> "29 Haven Drive V2"; a name already ending V2 -> V3.
export function nextVersionName(name: string) {
  const base = name.trim() || "Untitled costing";
  const m = base.match(/^(.*?)\s*V(\d+)$/i);
  return m ? `${m[1]} V${Number(m[2]) + 1}` : `${base} V2`;
}

// Duplicates a costing — the quote, every area and its lines, and all Access
// and Other items — as a new Draft called `name`. Copies what's saved in the
// database, so it's meant for a costing with no unsaved changes. Returns the
// new costing's id and figures (for the Hub sync); if anything fails part-way
// the half-made copy is removed again.
export async function copyCosting(sourceId: string, name: string) {
  const supabase = createClient();

  const { data: source, error: sourceErr } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", sourceId)
    .single();
  if (sourceErr || !source) throw new Error(sourceErr?.message ?? "Couldn't read that costing.");

  const quoteRow: Row = {};
  for (const key of QUOTE_FIELDS) if (key in source) quoteRow[key] = source[key];
  quoteRow.location = name;
  quoteRow.status = "draft";
  quoteRow.valid_until = new Date().toLocaleDateString("en-CA"); // today, yyyy-mm-dd

  const { data: created, error: createErr } = await supabase
    .from("quotes")
    .insert(quoteRow)
    .select("id")
    .single();
  if (createErr || !created) throw new Error(createErr?.message ?? "Couldn't create the copy.");
  const newId: string = created.id;

  try {
    const { data: buildings, error: bErr } = await supabase
      .from("quote_buildings")
      .select("*")
      .eq("quote_id", sourceId)
      .order("sort_order");
    if (bErr) throw bErr;

    const buildingIdMap = new Map<string, string>();
    let totalHours = 0;

    for (const b of buildings ?? []) {
      const { data: newBuilding, error: nbErr } = await supabase
        .from("quote_buildings")
        .insert({ ...fresh(b), quote_id: newId, summary_selected: false })
        .select("id")
        .single();
      if (nbErr || !newBuilding) throw nbErr ?? new Error("Couldn't copy an area.");
      buildingIdMap.set(b.id, newBuilding.id);

      const { data: lines, error: lErr } = await supabase
        .from("quote_building_lines")
        .select("*")
        .eq("building_id", b.id)
        .order("sort_order");
      if (lErr) throw lErr;
      // Sundry lines are retired (and were always empty), so they aren't copied.
      const keep = (lines ?? []).filter((l) => l.line_type !== "sundry");
      if (keep.length) {
        totalHours += keep.reduce((s, l) => s + (l.hours || 0), 0);
        const { error: nlErr } = await supabase
          .from("quote_building_lines")
          .insert(keep.map((l) => ({ ...fresh(l), building_id: newBuilding.id })));
        if (nlErr) throw nlErr;
      }
    }

    const { data: items, error: iErr } = await supabase
      .from("quote_line_items")
      .select("*")
      .eq("quote_id", sourceId)
      .order("sort_order");
    if (iErr) throw iErr;
    if (items?.length) {
      // Scaffold EDT / hire pairs stay paired, as their own new pair.
      const groups = new Map<string, string>();
      const copies = items.map((i) => {
        let group: string | null = i.scaffold_group ?? null;
        if (group) {
          if (!groups.has(group)) groups.set(group, crypto.randomUUID());
          group = groups.get(group)!;
        }
        return {
          ...fresh(i),
          quote_id: newId,
          building_id: i.building_id ? (buildingIdMap.get(i.building_id) ?? null) : null,
          scaffold_group: group,
        };
      });
      const { error: niErr } = await supabase.from("quote_line_items").insert(copies);
      if (niErr) throw niErr;
    }

    return {
      id: newId as string,
      customerId: (source.customer_id as string | null) ?? null,
      total: (source.total as number | null) ?? null,
      totalHours,
    };
  } catch (e) {
    // Undo the half-made copy (lines go with their areas).
    await supabase.from("quote_buildings").delete().eq("quote_id", newId);
    await supabase.from("quote_line_items").delete().eq("quote_id", newId);
    await supabase.from("quotes").delete().eq("id", newId);
    throw new Error(e instanceof Error ? e.message : "Couldn't copy the costing.");
  }
}
