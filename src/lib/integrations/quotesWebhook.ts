import { NextRequest, NextResponse } from "next/server";
import { safeEqual } from "@/lib/security/safeEqual"

/** Shared auth check for the Measures → Hub webhook routes. */
export function verifyQuotesWebhook(request: NextRequest): NextResponse | null {
  const expected = process.env.QUOTES_WEBHOOK_SECRET;
  const provided = request.headers.get("x-webhook-secret");

  if (!safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }
  return null;
}

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";
export type JobStatus = "draft" | "quoted" | "won" | "in_progress" | "complete" | "lost";

/** draft→draft, sent→quoted, accepted→won, declined|expired→lost. */
export function mapQuoteStatusToJobStatus(status: QuoteStatus): JobStatus {
  switch (status) {
    case "draft":
      return "draft";
    case "sent":
      return "quoted";
    case "accepted":
      return "won";
    case "declined":
    case "expired":
      return "lost";
  }
}
