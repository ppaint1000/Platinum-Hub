// Deployed as "platinum-quotes" on Vercel — the app itself was renamed to
// Measures, but the Vercel project/URL wasn't. Override via
// NEXT_PUBLIC_MEASURES_URL if that ever changes. Both Costing and Measures
// point into this one app (/costing and /site-measures).
export const MEASURES_URL = (
  process.env.NEXT_PUBLIC_MEASURES_URL ?? "https://platinum-quotes.vercel.app"
).replace(/\/$/, "");
