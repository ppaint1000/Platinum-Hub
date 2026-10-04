import { HubTopBar } from "@/components/dashboard/HubTopBar";

// Every Jobs page under the Hub's top bar.
export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HubTopBar activeHref="/jobs" />
      {children}
    </>
  );
}
