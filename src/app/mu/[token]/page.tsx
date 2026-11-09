// The unsubscribe link at the bottom of every Marketing email. No sign-in:
// the link's token is the contact's own. Clicking the button stops all
// marketing emails to them (Unsolicited Electronic Messages Act 2007).
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Unsubscribe · Platinum Painters", robots: { index: false, follow: false } };

const TOKEN = /^[0-9a-f-]{36}$/i;

async function unsubscribeAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const { redirect } = await import("next/navigation");
  let ok = false;
  if (TOKEN.test(token)) {
    const { data, error } = await createAdminClient()
      .from("marketing_contacts")
      .update({ unsubscribed: true, status: "Not interested" })
      .eq("unsubscribe_token", token)
      .select("id");
    ok = !error && !!data?.length;
  }
  redirect(`/mu/${token}?${ok ? "done=1" : "error=1"}`);
}

export default async function MarketingUnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { token } = await params;
  const { done, error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F4F0] p-6 text-[#16202E]">
      <div className="w-full max-w-md rounded-xl border border-[#E3E1DA] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Platinum Painters emails</h1>
        {done ? (
          <p className="mt-3">You&apos;re unsubscribed - we won&apos;t send you any more marketing emails.</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-[#3F4753]">Stop receiving marketing emails from Platinum Painters?</p>
            {error && <p className="mt-3 text-sm font-semibold text-[#B91C1C]">Sorry, that link didn&apos;t work. Reply to our email and we&apos;ll take you off the list.</p>}
            <form action={unsubscribeAction} className="mt-5">
              <input type="hidden" name="token" value={token} />
              <button className="rounded-lg bg-[#16202E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-black">Unsubscribe</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
