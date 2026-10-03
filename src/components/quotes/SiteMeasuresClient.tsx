"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Field, inputClass } from "@/components/quotes/Modal";
import { CustomerSelect } from "@/components/quotes/CustomerSelect";
import { SectionTabs } from "@/components/quotes/SectionTabs";
import { OwnerSelect } from "@/components/quotes/OwnerSelect";
import type { McOwner } from "@/lib/quotes/mcAccess";
import { fmtDate } from "@/lib/quotes/format";

// Coats and loading (production rate) vary line by line within the same
// surface — e.g. a soffit run with one segment needing an extra coat — so
// they live on the line, not the area.
type MeasureLine = {
  m: string;
  q: number | null;
  unit: string;
  coats: string;
  loading: string;
  showComment: boolean;
  comment: string;
};
type MeasureArea = {
  name: string;
  showComments: boolean;
  comments: string;
  lines: MeasureLine[];
};
type Building = { title: string; category: string; areas: MeasureArea[] };

type SiteMeasure = {
  id: string;
  customer_id: string | null;
  location: string | null;
  project: string | null;
  email: string | null;
  photos_taken: boolean;
  measured_on: string;
  buildings: Building[] | null;
  status: string;
  sent_costing_id: string | null;
  owner_id?: string | null;
};

type Customer = { id: string; name: string; is_active?: boolean };

type FormState = {
  customer_id: string;
  location: string;
  project: string;
  email: string;
  photos_taken: boolean;
  measured_on: string;
  buildings: Building[];
  status: string;
};

const STATUSES = ["draft", "finished", "sent_to_costing"];
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  finished: "Finished",
  sent_to_costing: "Sent to costing",
};
const UNITS = ["m2", "lm"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyLine(): MeasureLine {
  return { m: "", q: null, unit: "m2", coats: "", loading: "", showComment: false, comment: "" };
}

function emptyArea(): MeasureArea {
  return { name: "", showComments: false, comments: "", lines: [emptyLine()] };
}

function emptyBuilding(): Building {
  return { title: "", category: "Internal", areas: [emptyArea()] };
}

// Backfills records saved before coats/loading moved from once-per-area to
// once-per-line (and before buildings had a category) — carries the old
// area-level rate/coats onto every line so existing data isn't lost.
function normalizeBuildings(buildings: Building[]): Building[] {
  return buildings.map((b) => {
    const legacyBuilding = b as unknown as { category?: string };
    return {
      ...b,
      category: legacyBuilding.category ?? "Internal",
      areas: b.areas.map((a) => {
        const legacyArea = a as unknown as { rate?: string; coats?: string };
        return {
          ...a,
          // Existing records saved before the tick box existed already have
          // comments text with nothing to gate it — default the box to
          // ticked whenever there's something in it, so nothing already
          // written gets hidden.
          showComments: a.showComments ?? Boolean(a.comments),
          lines: a.lines.map((ln) => ({
            ...ln,
            coats: ln.coats ?? legacyArea.coats ?? "",
            loading: ln.loading ?? legacyArea.rate ?? "",
            showComment: ln.showComment ?? false,
            comment: ln.comment ?? "",
          })),
        };
      }),
    };
  });
}

function empty(): FormState {
  return {
    customer_id: "",
    location: "",
    project: "",
    email: "",
    photos_taken: false,
    measured_on: today(),
    buildings: [],
    status: "draft",
  };
}

// The site-measure formula: "<multiplier>/<seg1>,<seg2>,..." where a segment
// can be "AxN" for A repeated N times (e.g. three 3m windows -> "3x3").
// For unit "lm" the multiplier is ignored — the segments are just summed.
function computeQty(m: string, unit: string): number | null {
  const trimmed = m.trim();
  if (!trimmed.includes("/")) return null;
  const [leftRaw, rightRaw] = trimmed.split("/");
  const left = parseFloat(leftRaw);
  const segments = rightRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  let total = 0;
  for (const seg of segments) {
    const repeat = seg.match(/^(\d+(?:\.\d+)?)x(\d+)$/i);
    if (repeat) {
      total += parseFloat(repeat[1]) * parseInt(repeat[2], 10);
    } else {
      const v = parseFloat(seg);
      if (!isNaN(v)) total += v;
    }
  }

  if (unit === "lm") return Math.ceil(total);
  if (!isNaN(left)) return Math.ceil(left * total);
  return Math.ceil(total);
}

// The multiplier before the "/" is usually a wall/ceiling height in metres
// (>= 1). When someone enters a fraction there, they're almost always
// measuring a run of trim/skirting rather than an area — default the unit
// to "lm" so they don't have to flip the dropdown by hand.
function defaultUnitFor(m: string, current: string): string {
  const left = parseFloat(m.trim().split("/")[0]);
  if (isNaN(left)) return current;
  return left < 1 ? "lm" : "m2";
}

export function SiteMeasuresClient({
  initialMeasures,
  customers,
  owners = null,
}: {
  initialMeasures: SiteMeasure[];
  customers: Customer[];
  // Admins only: who each measure belongs to.
  owners?: McOwner[] | null;
}) {
  const router = useRouter();
  const [customerList, setCustomerList] = useState(customers);
  const [editing, setEditing] = useState<SiteMeasure | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(empty());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingCosting, setCreatingCosting] = useState(false);
  const [createCostingError, setCreateCostingError] = useState<string | null>(null);
  const [sentCostingId, setSentCostingId] = useState<string | null>(null);

  // Warns before closing the tab, refreshing, or navigating to a new
  // address while the add/edit form is open — closing it without saving
  // already discards it, so there's nothing at risk once it's closed.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!adding && !editing) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [adding, editing]);

  const customerName = (id: string | null) =>
    customerList.find((c) => c.id === id)?.name ?? "—";
  const buildingCount = (b: Building[] | null) => b?.length ?? 0;
  const activeCustomers = customerList.filter((c) => c.is_active !== false);

  const q = search.trim().toLowerCase();
  const filteredMeasures = q
    ? initialMeasures.filter((m) =>
        [customerName(m.customer_id), m.location, m.project]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      )
    : initialMeasures;

  function openAdd() {
    setForm({ ...empty(), buildings: [emptyBuilding()] });
    setError(null);
    setSentCostingId(null);
    setCreateCostingError(null);
    setAdding(true);
  }

  function openEdit(m: SiteMeasure) {
    setForm({
      customer_id: m.customer_id ?? "",
      location: m.location ?? "",
      project: m.project ?? "",
      email: m.email ?? "",
      photos_taken: m.photos_taken,
      measured_on: m.measured_on,
      buildings:
        m.buildings && m.buildings.length > 0
          ? normalizeBuildings(m.buildings)
          : [emptyBuilding()],
      status: m.status,
    });
    setError(null);
    setSentCostingId(m.sent_costing_id);
    setCreateCostingError(null);
    setEditing(m);
  }

  function close() {
    setAdding(false);
    setEditing(null);
  }

  function updateBuildings(fn: (buildings: Building[]) => Building[]) {
    setForm((f) => ({ ...f, buildings: fn(f.buildings) }));
  }

  function addBuilding() {
    updateBuildings((b) => [...b, emptyBuilding()]);
  }

  function removeBuilding(bi: number) {
    updateBuildings((b) => b.filter((_, i) => i !== bi));
  }

  function updateBuildingTitle(bi: number, title: string) {
    updateBuildings((b) => b.map((bld, i) => (i === bi ? { ...bld, title } : bld)));
  }

  function updateBuildingCategory(bi: number, category: string) {
    updateBuildings((b) => b.map((bld, i) => (i === bi ? { ...bld, category } : bld)));
  }

  function addArea(bi: number) {
    updateBuildings((b) =>
      b.map((bld, i) => (i === bi ? { ...bld, areas: [...bld.areas, emptyArea()] } : bld))
    );
  }

  function removeArea(bi: number, ai: number) {
    updateBuildings((b) =>
      b.map((bld, i) =>
        i === bi ? { ...bld, areas: bld.areas.filter((_, j) => j !== ai) } : bld
      )
    );
  }

  function updateArea(bi: number, ai: number, patch: Partial<MeasureArea>) {
    updateBuildings((b) =>
      b.map((bld, i) =>
        i === bi
          ? {
              ...bld,
              areas: bld.areas.map((a, j) => (j === ai ? { ...a, ...patch } : a)),
            }
          : bld
      )
    );
  }

  function addLine(bi: number, ai: number) {
    updateBuildings((b) =>
      b.map((bld, i) =>
        i === bi
          ? {
              ...bld,
              areas: bld.areas.map((a, j) =>
                j === ai ? { ...a, lines: [...a.lines, emptyLine()] } : a
              ),
            }
          : bld
      )
    );
  }

  // Building-level "+ Add line" shortcut — targets the last area, or
  // creates one first if the building has none yet.
  function addLineToLastArea(bi: number) {
    updateBuildings((b) =>
      b.map((bld, i) => {
        if (i !== bi) return bld;
        if (bld.areas.length === 0) return { ...bld, areas: [emptyArea()] };
        const lastIndex = bld.areas.length - 1;
        return {
          ...bld,
          areas: bld.areas.map((a, j) =>
            j === lastIndex ? { ...a, lines: [...a.lines, emptyLine()] } : a
          ),
        };
      })
    );
  }

  function removeLine(bi: number, ai: number, li: number) {
    updateBuildings((b) =>
      b.map((bld, i) =>
        i === bi
          ? {
              ...bld,
              areas: bld.areas.map((a, j) =>
                j === ai ? { ...a, lines: a.lines.filter((_, k) => k !== li) } : a
              ),
            }
          : bld
      )
    );
  }

  function updateLine(bi: number, ai: number, li: number, patch: Partial<MeasureLine>) {
    updateBuildings((b) =>
      b.map((bld, i) =>
        i === bi
          ? {
              ...bld,
              areas: bld.areas.map((a, j) =>
                j === ai
                  ? {
                      ...a,
                      lines: a.lines.map((ln, k) => {
                        if (k !== li) return ln;
                        const next = { ...ln, ...patch };
                        if (patch.m !== undefined) {
                          next.unit = defaultUnitFor(next.m, next.unit);
                        }
                        if (patch.m !== undefined || patch.unit !== undefined) {
                          next.q = computeQty(next.m, next.unit);
                        }
                        return next;
                      }),
                    }
                  : a
              ),
            }
          : bld
      )
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();

    // Drop fully-empty scaffolding rows the user never filled in.
    const buildings = form.buildings
      .map((b) => ({
        ...b,
        areas: b.areas
          .map((a) => ({
            ...a,
            lines: a.lines.filter((ln) => ln.m.trim() !== ""),
          }))
          .filter((a) => a.name.trim() !== "" || a.lines.length > 0),
      }))
      .filter((b) => b.title.trim() !== "" || b.areas.length > 0);

    const payload = {
      customer_id: form.customer_id || null,
      location: form.location.trim() || null,
      project: form.project.trim() || null,
      email: form.email.trim() || null,
      photos_taken: form.photos_taken,
      measured_on: form.measured_on,
      buildings,
      status: form.status,
    };

    const { error } = editing
      ? await supabase.from("site_measures").update(payload).eq("id", editing.id)
      : await supabase.from("site_measures").insert(payload);

    setSaving(false);
    if (error) return setError("Couldn't save — " + error.message);

    close();
    router.refresh();
  }

  // Turns a measured site into a costing: one quote_building per
  // Building/Area, one quote_building_line per measurement line (its
  // computed qty carries straight over, coats/loading become
  // coats/labour_rate) — status starts at "Draft to be checked" since
  // nothing here has been priced or reviewed yet. Linked back via
  // sent_costing_id so re-clicking reopens it instead of duplicating.
  // Shared by the "Create costing" button below (for a measure already
  // saved as "Sent to costing") and saveAndSendToCosting (which saves and
  // does this in one step) — takes the id of the already-saved measure to
  // link back to.
  async function createCostingFromForm(measureId: string): Promise<string> {
    const supabase = createClient();
    const { data: settings } = await supabase
      .from("costing_settings")
      .select(
        "labour_rate_sell, labour_rate_cost, spread_rate_sqm_per_litre, overtime_pct, overtime_rate, overtime_default_enabled, repaint_coats, general_prep_rate_sqm_per_hr, markup_material_pct, markup_other_pct, negotiating_factor_pct, gst_pct, paint_flat_addition"
      )
      .limit(1)
      .maybeSingle();

    // No paint is chosen per line here (Site Measures doesn't track
    // one) — fall back to the company's default paint's sell rate, the
    // same way a costing line with no paint picked already does, rather
    // than pricing material at $0.
    const { data: defaultPaint } = await supabase
      .from("paint_products")
      .select("cost_per_litre")
      .eq("is_default", true)
      .maybeSingle();

    const labourRateSell = settings?.labour_rate_sell ?? 55;
    const spreadRate = settings?.spread_rate_sqm_per_litre ?? 12;
    const prepRate = settings?.general_prep_rate_sqm_per_hr ?? 50;
    const materialRate = defaultPaint
      ? defaultPaint.cost_per_litre * (1 + (settings?.markup_material_pct ?? 0)) +
        (settings?.paint_flat_addition ?? 0)
      : 0;

    const { data: quote, error: quoteErr } = await supabase
      .from("quotes")
      .insert({
        customer_id: form.customer_id || null,
        location: form.location.trim() || null,
        project: form.project.trim() || null,
        status: "draft_review",
        tax_rate: settings ? settings.gst_pct * 100 : 0,
        labour_rate_sell: settings?.labour_rate_sell,
        labour_rate_cost: settings?.labour_rate_cost,
        spread_rate_sqm_per_litre: settings?.spread_rate_sqm_per_litre,
        overtime_pct: settings?.overtime_pct,
        overtime_rate: settings?.overtime_rate,
        overtime_enabled: settings?.overtime_default_enabled ?? false,
        repaint_coats: settings?.repaint_coats,
        general_prep_rate_sqm_per_hr: settings?.general_prep_rate_sqm_per_hr,
        markup_material_pct: settings?.markup_material_pct,
        markup_other_pct: settings?.markup_other_pct,
        negotiating_factor_pct: settings?.negotiating_factor_pct,
        gst_pct: settings?.gst_pct,
      })
      .select("id")
      .single();
    if (quoteErr || !quote) throw quoteErr ?? new Error("Couldn't create the costing.");

    for (const [bi, building] of form.buildings.entries()) {
      if (!building.title.trim() && building.areas.length === 0) continue;

      const { data: qb, error: bErr } = await supabase
        .from("quote_buildings")
        .insert({
          quote_id: quote.id,
          name: building.title.trim(),
          sort_order: bi,
          category: building.category,
          excludes: "",
          note: "",
          overtime_enabled: false,
          sheeting_up_enabled: true,
          sheeting_up_pct: 0.1,
          auto_wash_enabled: true,
        })
        .select("id")
        .single();
      if (bErr || !qb) throw bErr ?? new Error("Couldn't create a building.");

      const lines = building.areas.flatMap((area) =>
        area.lines
          .filter((ln) => ln.m.trim() !== "")
          .map((ln) => ({ area, ln }))
      );

      // The Wash tick box in the costing editor needs a "wash" line to
      // hang off (QuoteEditor.tsx's setAutoWash) - without one, ticking it
      // silently did nothing. Same template addBuilding() gives a building
      // created directly in the editor (sorted after the surfaces), so a
      // building sent here behaves the same way once it lands in Costing.
      const { error: washErr } = await supabase.from("quote_building_lines").insert({
        building_id: qb.id,
        surface_name: "Wash (including detergent)",
        line_type: "wash",
        girth: 1,
        qty: 0,
        coats: 1,
        labour_rate: 60,
        spread_rate: spreadRate,
        material_rate: 0,
        prep_rate: 0,
        hours: 0,
        litres: 0,
        cost: 0,
        calc_rate: 0,
        prep_hours: 0,
        sort_order: lines.length,
      });
      if (washErr) throw washErr;

      for (const [li, { area, ln }] of lines.entries()) {
        const qty = ln.q ?? 0;
        const coats = Number(ln.coats) || 0;
        const labourRate = Number(ln.loading) || 0;
        const girth = 1;
        const hours = labourRate > 0 ? (qty * coats) / labourRate : 0;
        const litres = spreadRate > 0 ? (qty * coats * girth) / spreadRate : 0;
        const cost = hours * labourRateSell + litres * materialRate;
        const calc_rate = qty > 0 ? cost / qty : 0;
        const prep_hours = prepRate > 0 ? qty / prepRate : 0;

        const { error: lErr } = await supabase.from("quote_building_lines").insert({
          building_id: qb.id,
          surface_name: area.name.trim() || "Other",
          line_type: "surface",
          girth,
          qty,
          coats,
          labour_rate: labourRate,
          spread_rate: spreadRate,
          material_rate: Math.round(materialRate * 100) / 100,
          prep_rate: prepRate,
          hours: Math.round(hours * 1000) / 1000,
          litres: Math.round(litres * 1000) / 1000,
          cost: Math.round(cost * 100) / 100,
          calc_rate: Math.round(calc_rate * 100) / 100,
          prep_hours: Math.round(prep_hours * 1000) / 1000,
          sort_order: li,
        });
        if (lErr) throw lErr;
      }
    }

    const { error: linkErr } = await supabase
      .from("site_measures")
      .update({ sent_costing_id: quote.id })
      .eq("id", measureId);
    if (linkErr) throw linkErr;

    return quote.id as string;
  }

  async function createCosting() {
    if (!editing) return;
    if (sentCostingId) {
      router.push(`/costing/${sentCostingId}`);
      return;
    }

    setCreatingCosting(true);
    setCreateCostingError(null);
    try {
      const quoteId = await createCostingFromForm(editing.id);
      router.push(`/costing/${quoteId}`);
    } catch (e) {
      setCreatingCosting(false);
      setCreateCostingError("Couldn't create costing — " + (e as Error).message);
    }
  }

  // The one-click version of "set status to Sent to costing, save, then
  // click Create costing" — saves the measure (creating it first if this
  // is a brand-new one) and creates its costing in the same action, so
  // saving with that status set can't be mistaken for actually having sent
  // it. If the costing step itself fails, the measure is left saved and
  // open for editing (status already "Sent to costing") so the "Create
  // costing" panel below can retry without re-entering anything.
  async function saveAndSendToCosting() {
    setSaving(true);
    setError(null);
    setCreateCostingError(null);
    const supabase = createClient();

    const buildings = form.buildings
      .map((b) => ({
        ...b,
        areas: b.areas
          .map((a) => ({
            ...a,
            lines: a.lines.filter((ln) => ln.m.trim() !== ""),
          }))
          .filter((a) => a.name.trim() !== "" || a.lines.length > 0),
      }))
      .filter((b) => b.title.trim() !== "" || b.areas.length > 0);

    const payload = {
      customer_id: form.customer_id || null,
      location: form.location.trim() || null,
      project: form.project.trim() || null,
      email: form.email.trim() || null,
      photos_taken: form.photos_taken,
      measured_on: form.measured_on,
      buildings,
      status: "sent_to_costing",
    };

    const alreadySentId = sentCostingId;
    let measureId: string;

    if (editing) {
      const { error } = await supabase.from("site_measures").update(payload).eq("id", editing.id);
      if (error) {
        setSaving(false);
        setError("Couldn't save — " + error.message);
        return;
      }
      measureId = editing.id;
    } else {
      const { data, error } = await supabase
        .from("site_measures")
        .insert(payload)
        .select("id")
        .single();
      if (error || !data) {
        setSaving(false);
        setError("Couldn't save — " + (error?.message ?? "Unknown error."));
        return;
      }
      measureId = data.id;
    }

    setForm((f) => ({ ...f, status: "sent_to_costing" }));
    setSaving(false);

    if (alreadySentId) {
      router.push(`/costing/${alreadySentId}`);
      return;
    }

    setCreatingCosting(true);
    try {
      const quoteId = await createCostingFromForm(measureId);
      router.push(`/costing/${quoteId}`);
    } catch (e) {
      setCreatingCosting(false);
      setCreateCostingError("Saved, but couldn't create the costing — " + (e as Error).message);
      setAdding(false);
      setEditing({
        id: measureId,
        customer_id: form.customer_id || null,
        location: form.location.trim() || null,
        project: form.project.trim() || null,
        email: form.email.trim() || null,
        photos_taken: form.photos_taken,
        measured_on: form.measured_on,
        buildings,
        status: "sent_to_costing",
        sent_costing_id: null,
      });
      router.refresh();
    }
  }

  async function remove(m: SiteMeasure) {
    if (!confirm(`Delete this site measure${m.project ? ` (${m.project})` : ""}? This can't be undone.`))
      return;
    const supabase = createClient();
    // .select() after delete so a permissions problem that blocks the row
    // rather than raising an error (RLS treats a row it hides as simply
    // not matching, not as a failure) still surfaces something instead of
    // the row silently staying put.
    const { data, error } = await supabase.from("site_measures").delete().eq("id", m.id).select("id");
    if (error) return alert("Couldn't delete — " + error.message);
    if (!data || data.length === 0) {
      return alert("Couldn't delete — you don't have permission to remove this record.");
    }
    router.refresh();
  }

  return (
    <div>
      <SectionTabs active="site-measures" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Site Measures</h1>
          <p className="mt-1 text-sm text-muted">
            {filteredMeasures.length} record{filteredMeasures.length === 1 ? "" : "s"}
            {q && ` of ${initialMeasures.length}`}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-black"
        >
          <Plus className="h-4 w-4" />
          Add site measure
        </button>
      </div>

      <input
        className={inputClass + " mb-4 w-full max-w-sm"}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by customer, location, or project…"
      />

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        {filteredMeasures.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            {q ? "No site measures match your search." : "No site measures yet."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Location</th>
                {owners && <th className="px-5 py-3">Salesperson</th>}
                <th className="hidden px-5 py-3 sm:table-cell">Project</th>
                <th className="hidden px-5 py-3 sm:table-cell">Buildings</th>
                <th className="hidden px-5 py-3 md:table-cell">Measured</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {filteredMeasures.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => openEdit(m)}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-background"
                >
                  <td className="whitespace-nowrap px-5 py-3 font-medium text-ink">
                    {customerName(m.customer_id)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-muted">{m.location ?? "—"}</td>
                  {owners && (
                    <td className="whitespace-nowrap px-5 py-3">
                      <OwnerSelect table="site_measures" id={m.id} ownerId={m.owner_id ?? null} owners={owners} />
                    </td>
                  )}
                  <td className="hidden whitespace-nowrap px-5 py-3 text-muted sm:table-cell">
                    {m.project ?? "—"}
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 text-muted sm:table-cell">
                    {buildingCount(m.buildings)}
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 text-muted md:table-cell">
                    {fmtDate(m.measured_on)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    {STATUS_LABELS[m.status] ?? m.status}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(m);
                        }}
                        aria-label="Edit"
                        className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(m);
                        }}
                        aria-label="Delete"
                        className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-brand-red"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(adding || editing) && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 px-2 py-2 sm:px-4 sm:py-[5vh]"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="flex max-h-[96vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xl sm:max-h-[90vh] md:max-w-4xl lg:max-w-5xl xl:max-w-6xl">
            <div className="flex items-center justify-between border-b border-border bg-surface px-5 py-4">
              <h3 className="text-sm font-semibold text-ink">
                {editing ? "Edit site measure" : "Add site measure"}
              </h3>
              <button
                onClick={close}
                aria-label="Close"
                className="rounded-md p-1 text-muted transition hover:bg-background hover:text-ink"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Customer">
                  <CustomerSelect
                    customers={activeCustomers}
                    value={form.customer_id}
                    onChange={(id) => setForm({ ...form, customer_id: id })}
                    onCreated={(c) =>
                      setCustomerList((prev) => [{ ...c, is_active: true }, ...prev])
                    }
                    unassignedLabel="Unassigned"
                  />
                </Field>
                <Field label="Status">
                  <select
                    className={inputClass}
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s] ?? s}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Location">
                  <input
                    className={inputClass}
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </Field>
                <Field label="Project">
                  <input
                    className={inputClass}
                    value={form.project}
                    onChange={(e) => setForm({ ...form, project: e.target.value })}
                  />
                </Field>
                <Field label="Measured on">
                  <input
                    type="date"
                    className={inputClass}
                    value={form.measured_on}
                    onChange={(e) => setForm({ ...form, measured_on: e.target.value })}
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    className={inputClass}
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.photos_taken}
                  onChange={(e) => setForm({ ...form, photos_taken: e.target.checked })}
                />
                Photos taken
              </label>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-ink">Building / Area</h4>
                  <button
                    type="button"
                    onClick={addBuilding}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-background"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add building
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  {form.buildings.map((building, bi) => (
                    <div key={bi} className="rounded-lg border border-border bg-background p-3">
                      <div className="mb-3 flex items-center gap-2">
                        <input
                          className={inputClass + " flex-1"}
                          value={building.title}
                          onChange={(e) => updateBuildingTitle(bi, e.target.value)}
                          placeholder="Building / Area"
                        />
                        <select
                          className={inputClass + " w-28"}
                          value={building.category}
                          onChange={(e) => updateBuildingCategory(bi, e.target.value)}
                        >
                          <option value="Internal">Interior</option>
                          <option value="External">Exterior</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeBuilding(bi)}
                          aria-label="Remove building"
                          className="rounded-md p-1.5 text-muted transition hover:bg-surface hover:text-brand-red"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex flex-col gap-3">
                        {building.areas.map((area, ai) => (
                          <div key={ai} className="rounded-lg border border-border bg-surface p-3">
                            <div className="flex items-center gap-2">
                              <input
                                className={inputClass + " flex-1"}
                                value={area.name}
                                onChange={(e) => updateArea(bi, ai, { name: e.target.value })}
                                placeholder="Surface"
                              />
                              <label className="flex items-center gap-1 text-[11px] text-muted">
                                <input
                                  type="checkbox"
                                  checked={area.showComments}
                                  onChange={(e) =>
                                    updateArea(bi, ai, { showComments: e.target.checked })
                                  }
                                />
                                Comment
                              </label>
                              <button
                                type="button"
                                onClick={() => removeArea(bi, ai)}
                                aria-label="Remove area"
                                className="flex items-center justify-center rounded-md p-1.5 text-muted transition hover:bg-background hover:text-brand-red"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>

                            {area.showComments && (
                              <input
                                className={inputClass + " mt-2 w-full"}
                                value={area.comments}
                                onChange={(e) => updateArea(bi, ai, { comments: e.target.value })}
                                placeholder="Comments"
                              />
                            )}

                            <div className="mt-4 flex flex-col gap-3 overflow-x-auto">
                              {area.lines.length > 0 && (
                                <div className="grid grid-cols-[minmax(140px,1fr)_5rem_4rem_4rem_3.5rem_auto_auto] gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                                  <span>Formula</span>
                                  <span>Unit</span>
                                  <span>Qty</span>
                                  <span>Prod Rate</span>
                                  <span>Coats</span>
                                  <span />
                                  <span />
                                </div>
                              )}
                              {area.lines.map((line, li) => (
                                <div
                                  key={li}
                                  className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-background/40 p-2"
                                >
                                  <div className="grid grid-cols-[minmax(140px,1fr)_5rem_4rem_4rem_3.5rem_auto_auto] items-center gap-1.5">
                                    <input
                                      className={inputClass}
                                      value={line.m}
                                      onChange={(e) =>
                                        updateLine(bi, ai, li, { m: e.target.value })
                                      }
                                      placeholder="height/seg1,seg2,…"
                                    />
                                    <select
                                      className={inputClass}
                                      value={line.unit}
                                      onChange={(e) =>
                                        updateLine(bi, ai, li, { unit: e.target.value })
                                      }
                                    >
                                      {UNITS.map((u) => (
                                        <option key={u} value={u}>
                                          {u}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="number"
                                      className={inputClass}
                                      value={line.q ?? ""}
                                      onChange={(e) =>
                                        updateLine(bi, ai, li, {
                                          q: e.target.value ? Number(e.target.value) : null,
                                        })
                                      }
                                    />
                                    <input
                                      className={inputClass}
                                      value={line.loading}
                                      onChange={(e) =>
                                        updateLine(bi, ai, li, { loading: e.target.value })
                                      }
                                      placeholder="Prod Rate"
                                    />
                                    <input
                                      className={inputClass}
                                      value={line.coats}
                                      onChange={(e) =>
                                        updateLine(bi, ai, li, { coats: e.target.value })
                                      }
                                      placeholder="Coats"
                                    />
                                    <label className="flex items-center gap-1 text-[11px] text-muted">
                                      <input
                                        type="checkbox"
                                        checked={line.showComment}
                                        onChange={(e) =>
                                          updateLine(bi, ai, li, {
                                            showComment: e.target.checked,
                                          })
                                        }
                                      />
                                      Comment
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => removeLine(bi, ai, li)}
                                      aria-label="Remove line"
                                      className="rounded-md p-1.5 text-muted transition hover:bg-background hover:text-brand-red"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  {line.showComment && (
                                    <textarea
                                      className={inputClass + " min-h-14 w-full resize-y"}
                                      value={line.comment}
                                      onChange={(e) =>
                                        updateLine(bi, ai, li, { comment: e.target.value })
                                      }
                                      placeholder="Comment for this line"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => addLineToLastArea(bi)}
                            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-background"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add line
                          </button>
                          <button
                            type="button"
                            onClick={() => addArea(bi)}
                            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-background"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add area
                          </button>
                          <button
                            type="button"
                            onClick={addBuilding}
                            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-background"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add building
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {form.status === "sent_to_costing" && (
                <div className="rounded-lg border border-brand-red/30 bg-brand-red/5 p-4">
                  <h4 className="text-sm font-semibold text-ink">Sent to costing</h4>
                  {!editing ? (
                    <p className="mt-1 text-xs text-muted">
                      Save this site measure first, then reopen it to create the costing.
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-xs text-muted">
                        {sentCostingId
                          ? "Already sent — this measure's costing is ready to open."
                          : "Creates a costing under this customer, pre-filled with each building/area's surfaces, quantities, coats, and production rates — status starts as \"Draft to be checked\"."}
                      </p>
                      <button
                        type="button"
                        onClick={createCosting}
                        disabled={creatingCosting}
                        className="mt-3 rounded-lg bg-ink px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-black disabled:opacity-60"
                      >
                        {creatingCosting
                          ? "Creating…"
                          : sentCostingId
                            ? "View costing"
                            : "Create costing"}
                      </button>
                      {createCostingError && (
                        <p className="mt-2 text-xs text-brand-red">{createCostingError}</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {error && <p className="text-sm text-brand-red">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 border-t border-border bg-surface px-5 py-3.5">
              <button
                onClick={close}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink transition hover:bg-background"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || creatingCosting}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={saveAndSendToCosting}
                disabled={saving || creatingCosting}
                className="rounded-lg border border-ink bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-background disabled:opacity-60"
              >
                {saving
                  ? "Saving…"
                  : creatingCosting
                    ? "Creating costing…"
                    : "Save and send to costing"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
