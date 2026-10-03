// Server-side only: a proposal was sent / viewed / accepted - updates its
// job and emails whoever wants to know (see recordProposalActivity). Never
// throws: a failed email mustn't stop a customer accepting or a proposal
// being sent.
import { recordProposalActivity, type ProposalActivity as Activity } from "@/lib/integrations/proposalActivity";

export type ProposalActivity = Activity & { acceptedOptions?: string[] };

export async function notifyHubProposal(activity: ProposalActivity): Promise<{ ok: boolean; reason?: string }> {
  try {
    const result = await recordProposalActivity(activity, new URL(activity.proposalUrl).origin);
    return result.status === 200 ? { ok: true } : { ok: false, reason: String(result.body.reason ?? result.body.error ?? result.status) };
  } catch (e) {
    console.error("[hubNotify] proposal activity failed", e);
    return { ok: false, reason: "Couldn't record it." };
  }
}
