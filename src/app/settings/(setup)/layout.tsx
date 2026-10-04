import { HubTopBar } from "@/components/dashboard/HubTopBar";
import { McAccessProvider } from "@/components/quotes/McAccess";
import { requireMcAccess } from "@/lib/quotes/mcAccess";

// Rates, price lists and proposal templates: admin only, in Settings (the
// "‹ Settings ›" bar above leads back).
export default async function SetupLayout({ children }: { children: React.ReactNode }) {
  const access = await requireMcAccess("admin");
  return (
    <>
      <HubTopBar activeHref="/settings" />
      <McAccessProvider value={access}>
        <main className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </McAccessProvider>
    </>
  );
}
