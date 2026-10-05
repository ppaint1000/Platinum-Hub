// Health & safety (like HazardCo): reports, incidents, the hazard register,
// tasks, documents and contractors. Anyone with Health & safety ticked on
// the Users page.
import type { Metadata } from "next";
import { HubTopBar } from "@/components/dashboard/HubTopBar";
import { SafetyNav } from "@/components/safety/SafetyNav";
import { safetyContext } from "@/lib/safety/data";

export const metadata: Metadata = { title: "Health & safety · Platinum Hub" };

export default async function SafetyLayout({ children }: { children: React.ReactNode }) {
  const { isManager } = await safetyContext();
  return (
    <>
      <HubTopBar activeHref="/safety" />
      <main className="min-h-screen bg-[#F5F4F0] px-4 pb-12 pt-5 text-[#16202E] md:px-8 md:pt-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          <h1 className="text-[28px] font-bold leading-tight md:text-3xl">Health &amp; safety</h1>
          <SafetyNav isManager={isManager} />
          {children}
        </div>
      </main>
    </>
  );
}
