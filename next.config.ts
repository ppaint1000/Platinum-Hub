import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer's PDF generation goes through pdfkit, which loads
  // its standard-14 font metrics (Helvetica.cjs etc.) from disk at *render*
  // time via a dynamic path, not a static import - Vercel's file-tracing
  // only follows static imports, so it silently drops that folder from
  // every serverless function's bundle. Result: PDF generation works fine
  // locally (full node_modules on disk) but throws MODULE_NOT_FOUND in
  // production, on every route that renders a PDF (timesheet report
  // export, the weekly report email, timesheet-confirmation emails) -
  // three call sites across route handlers and server actions, so this is
  // applied to every route rather than chasing each one down individually.
  // The folder is 190KB, so bundling it everywhere is a non-issue.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/pdfkit/js/standard-fonts/**"],
  },
  // Private: tell every search engine and AI tool not to index, keep, quote
  // or train on any page (see also src/app/robots.ts), and stop other sites
  // showing the Hub inside a frame.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex, noai, noimageai" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Browsers must use HTTPS for the Hub for the next 2 years.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Don't let a browser guess a file's type (stops an upload being run as a script).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Clicking a link out of the Hub only tells the other site "platinum-painters-hub",
          // never the full address - so proposal / work order links (/p/<token>) can't leak.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Only location is used (clock-on, sign-in, fuel entries); everything else is off.
          { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()" },
          // Ask Android Chrome for the phone's model, for the sign-in log (lib/security/signInGate.ts).
          { key: "Accept-CH", value: "Sec-CH-UA-Model" },
        ],
      },
    ];
  },
};

export default nextConfig;
