// The customer's proposal link: /p/<token>. No sign-in, but the customer
// types the proposal's 6-digit code once (kept in a cookie) - the database
// checks it (proposal_by_token). Staff who can see the costing get straight
// in. ?preview=1 is staff looking from the costing: not counted as a view.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ProposalDocument, type ProposalData } from "@/components/proposals/ProposalDocument";
import { ProposalAcceptance, type AcceptedRecord } from "@/components/proposals/ProposalAcceptance";
import { ViewTracker } from "@/components/proposals/ViewTracker";
import { PrintButton } from "@/components/quotes/PrintButton";
import { withTemplateDefaults, type SettingsRow } from "@/lib/quotes/proposalDefaults";
import { proposalCodeCookie } from "@/lib/quotes/proposalCode";
import { CodeForm } from "./CodeForm";

export const metadata: Metadata = {
  title: "Painting proposal · Platinum Painters",
  robots: { index: false, follow: false },
};

type Row = ProposalData & {
  proposal: ProposalData["proposal"] & AcceptedRecord & { accepted_at: string | null };
};

export default async function ProposalLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { token } = await params;
  const { preview } = await searchParams;
  const supabase = await createClient();
  const code = (await cookies()).get(proposalCodeCookie(token))?.value ?? null;
  const { data } = await supabase.rpc("proposal_by_token", { p_token: token, p_code: code });
  if (!data) return <CodeForm token={token} />;

  const row = data as Row;
  // Until the company templates are saved, the standard wording is used.
  row.settings = withTemplateDefaults(row.settings as unknown as SettingsRow);
  const isPreview = preview === "1";
  const p = row.proposal;
  // The "Your contact" box is turned off - the sign-off already has the
  // contact details. To show it again: row.contact = await
  // fetchSalesContact(quote_id) (lib/hubContact.ts).
  const accepted: AcceptedRecord | null = p.accepted_at
    ? {
        accepted_at: p.accepted_at,
        accepted_name: p.accepted_name,
        accepted_signature: p.accepted_signature,
        accepted_options: p.accepted_options,
        accepted_total: p.accepted_total,
      }
    : null;

  return (
    <div className="min-h-screen bg-background">
      {!isPreview && <ViewTracker token={token} code={code} />}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-white/95 px-4 py-2.5 backdrop-blur print:hidden">
        <p className="text-sm font-semibold text-ink">
          {isPreview ? "Preview — this is what the customer sees" : "Painting proposal"}
        </p>
        <div className="flex items-center gap-2">
          {!accepted && row.proposal.pricing && (
            <a href="#accept" className="rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-ink hover:bg-background">
              Accept
            </a>
          )}
          <PrintButton label="Download PDF" />
        </div>
      </div>
      <ProposalDocument
        data={row}
        acceptance={
          <div id="accept">
            <ProposalAcceptance token={token} code={code} pricing={p.pricing} accepted={accepted} preview={isPreview} />
          </div>
        }
      />
    </div>
  );
}
