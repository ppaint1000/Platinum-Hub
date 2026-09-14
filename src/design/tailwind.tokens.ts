// Platinum Hub design tokens — Jobs module.
//
// This project uses Tailwind v4's CSS-first config (@theme in
// src/app/globals.css), not a tailwind.config.ts, so the colour values
// below are also defined as --color-* variables there. This file is the
// source of truth for those values plus the plain-JS lookups (status
// colour/label) that components read directly, outside of Tailwind classes.
export const platinumTokens = {
  colors: {
    paper: {
      raised: "#FFFFFF", // panels/tables sitting above the page
      sunken: "#E9ECEA", // input backgrounds, table stripe
    },
    ink: {
      soft: "#4A544F", // secondary text
      faint: "#8A938E", // placeholder / disabled
    },
    line: "#D8DDDA", // hairline rules
    accent: {
      DEFAULT: "#1D4E5F", // Platinum Blue — primary actions, active nav
      hover: "#173F4D",
      soft: "#E4EDEF", // tinted background for selected rows
    },
    status: {
      draft: "#8A938E", // grey — nothing committed yet
      quoted: "#C98A2B", // ochre — awaiting decision
      won: "#1D4E5F", // platinum blue — converted, not yet running
      inProgress: "#3F7D58", // forest green — active, healthy
      complete: "#4A544F", // settled graphite — done, filed
      lost: "#8A938E", // grey — did not proceed
      overBudget: "#B33F3F", // brick — needs attention
    },
  },
} as const;

// Status colour lookup used by StatusRow / StatusLabel.
export const jobStatusColor: Record<string, string> = {
  draft: platinumTokens.colors.status.draft,
  quoted: platinumTokens.colors.status.quoted,
  won: platinumTokens.colors.status.won,
  in_progress: platinumTokens.colors.status.inProgress,
  complete: platinumTokens.colors.status.complete,
  lost: platinumTokens.colors.status.lost,
};

export const jobStatusLabel: Record<string, string> = {
  draft: "Draft",
  quoted: "Quoted",
  won: "Won",
  in_progress: "In progress",
  complete: "Complete",
  lost: "Lost",
};

export const overBudgetColor = platinumTokens.colors.status.overBudget;
