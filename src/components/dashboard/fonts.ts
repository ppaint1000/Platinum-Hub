import { Bricolage_Grotesque, Figtree } from "next/font/google";

// Fonts for the Dashboard and sales dashboards.
const displayFont = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display" });
const bodyFont = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

export const dashboardFontClass = `${displayFont.variable} ${bodyFont.variable}`;
