// Where invite and password-reset emails send people: the Hub's own
// /accept-invite page, which exchanges the token on a real button click
// (see authEmails.ts), then /reset-password. The standalone Timesheets app
// now just forwards to the Hub.
export const SITE_URL = process.env.NEXT_PUBLIC_HUB_URL ?? 'https://platinum-painters-hub.vercel.app'
