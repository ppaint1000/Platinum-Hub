// The proposal for a costing: fill in the customer-facing document, see
// the pricing it'll show, preview it, copy the customer's link, and see
// whether they've opened it and accepted.
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { proposalPricing } from "@/lib/quotes/proposalPricing";
import {
  DEFAULT_EXCLUDES,
  DEFAULT_LETTER_INTRO,
  DEFAULT_SPEC_INTRO,
} from "@/lib/quotes/proposalDefaults";
import { ProposalBuilder, type BuilderProposal, type ViewRow } from "@/components/proposals/ProposalBuilder";
import { resolveSections } from "@/lib/quotes/proposalSections";

function todayNZ() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland" }).format(new Date());
}

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: quote }, { data: existing }, { data: settings }, { data: buildings }] = await Promise.all([
    supabase.from("quotes").select("id, location, project, status, customers:clients(name, email, phone, address)").eq("id", id).single(),
    supabase.from("proposals").select("*").eq("quote_id", id).maybeSingle(),
    supabase.from("proposal_settings").select("letter_intro").maybeSingle(),
    supabase
      .from("quote_buildings")
      .select("name, excludes, is_option, quote_building_lines(surface_name, qty, line_type)")
      .eq("quote_id", id)
      .order("sort_order"),
  ]);
  if (!quote) notFound();

  const customer = quote.customers as unknown as { name: string; address: string | null } | null;
  const labels = (existing?.pricing_labels ?? {}) as Record<string, string>;
  const pricing = await proposalPricing(supabase, id, labels);

  // Pre-fill for a new proposal, from the costing.
  const surfaces: string[] = [];
  const areaExcludes: string[] = [];
  for (const b of (buildings ?? []) as {
    name: string | null;
    excludes: string | null;
    is_option: boolean | null;
    quote_building_lines: { surface_name: string; qty: number; line_type: string | null }[] | null;
  }[]) {
    for (const l of b.quote_building_lines ?? []) {
      const name = l.surface_name?.trim();
      if (name && Number(l.qty) > 0 && (l.line_type ?? "surface") === "surface" && !surfaces.includes(name)) surfaces.push(name);
    }
    if (b.excludes?.trim()) areaExcludes.push(b.excludes.trim());
  }

  const proposal: BuilderProposal = existing
    ? {
        ...existing,
        subject: existing.subject ?? null,
        spec_rows: existing.spec_rows ?? [],
        site_plan: existing.site_plan ?? [],
        condition_photos: existing.condition_photos ?? [],
        sections: resolveSections(existing.sections),
      }
    : {
        id: null,
        token: null,
        proposal_date: todayNZ(),
        recipient_name: "",
        recipient_company: customer?.name ?? "",
        recipient_address: customer?.address ?? "",
        salutation: "",
        subject: "",
        site_address: quote.location ?? "",
        letter: settings?.letter_intro || DEFAULT_LETTER_INTRO,
        extent_includes: surfaces.join("\n"),
        extent_excludes: [DEFAULT_EXCLUDES, ...areaExcludes].join("\n"),
        spec_intro: DEFAULT_SPEC_INTRO,
        spec_rows: surfaces.map((s) => ({ surface: s, prime: "", coat1: "", coat2: "", coat3: "" })),
        site_plan: [],
        site_plan_notes: "",
        condition_photos: [],
        sections: resolveSections(null),
        pricing_labels: {},
        pricing_edits: {},
        sent_at: null,
        first_viewed_at: null,
        last_viewed_at: null,
        view_count: 0,
        total_view_seconds: 0,
        accepted_at: null,
        accepted_name: null,
        accepted_signature: null,
        accepted_options: null,
        accepted_total: null,
        pricing: null,
      };

  const { data: views } = existing
    ? await supabase
        .from("proposal_views")
        .select("started_at, seconds")
        .eq("proposal_id", existing.id)
        .order("started_at", { ascending: false })
        .limit(20)
    : { data: [] };

  return (
    <ProposalBuilder
      quoteId={id}
      jobName={quote.project || quote.location || "Untitled job"}
      customerName={customer?.name ?? "—"}
      initial={proposal}
      livePricing={pricing}
      views={(views ?? []) as ViewRow[]}
    />
  );
}
