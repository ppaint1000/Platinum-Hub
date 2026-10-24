import { timingSafeEqual } from "crypto";

/**
 * Compares a secret sent with a request (webhook secret, cron token) to the
 * real one without leaking how many characters matched through response
 * timing - a plain `!==` stops at the first wrong character, which lets an
 * attacker guess a secret one character at a time.
 */
export function safeEqual(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
