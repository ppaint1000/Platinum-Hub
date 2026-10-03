// Proposal templates - the company-wide wording and pictures used on every
// proposal (see ProposalDocument).
import { createClient } from "@/lib/supabase/server";
import { ProposalTemplatesClient } from "@/components/proposals/ProposalTemplatesClient";
import { withTemplateDefaults, type SettingsRow } from "@/lib/quotes/proposalDefaults";
import { requireMcAccess } from "@/lib/quotes/mcAccess";

export default async function ProposalTemplatesPage() {
  await requireMcAccess("admin");
  const supabase = await createClient();
  const { data } = await supabase.from("proposal_settings").select("*").maybeSingle<SettingsRow>();

  // Until the templates are saved, start from the wording and pictures in
  // Platinum Painters' own proposals.
  return <ProposalTemplatesClient initial={withTemplateDefaults(data)} neverSaved={!data?.methodology && !data?.terms} />;
}
