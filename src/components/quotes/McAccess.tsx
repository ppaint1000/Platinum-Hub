"use client";

import { createContext, useContext } from "react";
import type { McAccess } from "@/lib/quotes/mcAccess";

// The signed-in person's Measures / Costing access, for the tabs and links
// (the pages and the database check it again).
const Ctx = createContext<McAccess>({ isAdmin: false, measures: false, costing: false, jobs: false });

export function McAccessProvider({ value, children }: { value: McAccess; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMcAccess() {
  return useContext(Ctx);
}
