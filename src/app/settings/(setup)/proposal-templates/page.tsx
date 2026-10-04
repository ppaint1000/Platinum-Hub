// Proposal templates - the company-wide wording and pictures used on every
// proposal (see ProposalDocument).
import { createClient } from "@/lib/supabase/server";
import { ProposalTemplatesClient } from "@/components/proposals/ProposalTemplatesClient";
import { withTemplateDefaults, type SettingsRow } from "@/lib/quotes/proposalDefaults";
import { requireMcAccess } from "@/lib/quotes/mcAccess";
import { ProposalTimingSettings } from "@/components/proposals/ProposalTimingSettings";

export default async function ProposalTemplatesPage() {
  await requireMcAccess("admin");
  const supabase = await createClient();
  const { data } = await supabase
    .from("proposal_settings")
    .select("*")
    .maybeSingle<SettingsRow & { valid_days?: number | null; customer_reminder_days?: number | null }>();

  // Until the templates are saved, start from the wording and pictures in
  // Platinum Painters' own proposals.
  return (
    <>
      <ProposalTimingSettings validDays={data?.valid_days ?? 30} reminderDays={data?.customer_reminder_days ?? 7} />
      <ProposalTemplatesClient initial={withTemplateDefaults(data)} neverSaved={!data?.methodology && !data?.terms} />
    </>
  );
}
