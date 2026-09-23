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
};

export default nextConfig;
