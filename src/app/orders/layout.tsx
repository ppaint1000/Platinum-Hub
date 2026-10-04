import type { Metadata } from "next";
import { requireAppAccess } from "@/lib/auth/requireAppAccess";
import { HubTopBar } from "@/components/dashboard/HubTopBar";

export const metadata: Metadata = {
  title: "Platinum Painters Orders",
};

export default async function OrdersLayout({ children }: { children: React.ReactNode }) {
  await requireAppAccess("orders");

  return (
    <div className="flex min-h-screen flex-col">
      <HubTopBar activeHref="/orders" />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
