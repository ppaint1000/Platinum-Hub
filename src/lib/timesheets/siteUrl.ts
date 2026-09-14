// Deliberately still the STANDALONE Timesheets app's URL, not the Hub's -
// invite/recovery links generated from these ported routes need to land on
// a page that can actually exchange the token (/accept-invite,
// /reset-password), and those pages haven't been ported into the Hub yet.
// Must exactly match the "Site URL" configured in Supabase Auth ->
// URL Configuration, or Supabase silently falls back to that value instead
// of honoring redirectTo. Update this (and port the auth pages) as part of
// the real cutover, not before.
export const SITE_URL = 'https://platinum-painters-timesheets.vercel.app'
