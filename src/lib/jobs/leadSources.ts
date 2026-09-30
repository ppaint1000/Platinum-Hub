// Where a job's enquiry came from (jobs.lead_source, see
// supabase/jobs_lead_source.sql). The Clients dashboard shows the win rate
// for each. Stored as the label itself, so a new source only needs adding here.
export const LEAD_SOURCES = [
  "Repeat client",
  "Referral",
  "Website",
  "Google",
  "Facebook / social media",
  "Builder / project manager",
  "Property manager / body corporate",
  "Signage / drive-by",
  "Tender",
  "Other",
] as const;

export const NO_LEAD_SOURCE = "Not recorded";
