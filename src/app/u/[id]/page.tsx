// The unsubscribe link at the bottom of every automatic (Drips) email. No
// sign-in: the link's id is the customer's own enrolment. Clicking the
// button stops all automatic emails to them.
import type { Metadata } from "next";
import { unsubscribe } from "@/lib/drips/drips";

export const metadata: Metadata = { title: "Unsubscribe · Platinum Painters", robots: { index: false, follow: false } };

async function unsubscribeAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "");
  const { redirect } = await import("next/navigation");
  const ok = /^[0-9a-f-]{36}$/i.test(id) && (await unsubscribe(id));
  redirect(`/u/${id}?${ok ? "done=1" : "error=1"}`);
}

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string }>;
}) {
  const { id } = await params;
  const { done, error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F4F0] p-6 text-[#16202E]">
      <div className="w-full max-w-md rounded-xl border border-[#E3E1DA] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Platinum Painters emails</h1>
        {done ? (
          <p className="mt-3">You&apos;re unsubscribed - we won&apos;t send you any more automatic emails.</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-[#3F4753]">
              Stop receiving our automatic follow-up emails? You&apos;ll still hear from us directly about any job you&apos;ve booked.
            </p>
            {error && <p className="mt-3 text-sm font-semibold text-[#B91C1C]">Sorry, that link didn&apos;t work. Reply to our email and we&apos;ll take you off the list.</p>}
            <form action={unsubscribeAction} className="mt-5">
              <input type="hidden" name="id" value={id} />
              <button className="rounded-lg bg-[#16202E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-black">Unsubscribe</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
