// "Inspect now" links in the ladder reminder emails: open the inspection
// form for one ladder without signing in. Each link is signed for that
// person, that ladder and the day it was sent, and works for
// LINK_VALID_DAYS - so it can't be guessed, and an old email stops working.
// Server-side only.
import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, nzTodayDateString } from "@/lib/timesheets/formatNZ";

export const LINK_VALID_DAYS = 30;

async function key() {
  const { data } = await createAdminClient().from("app_cron_tokens").select("token").eq("name", "hub_cron").single();
  if (!data?.token) throw new Error("No signing key");
  return data.token as string;
}

async function sign(ladderId: string, userId: string, day: string) {
  return createHmac("sha256", await key()).update(`ladder:${ladderId}:${userId}:${day}`).digest("base64url").slice(0, 32);
}

const UUID = /^[0-9a-f-]{36}$/i;

export async function verifyLadderLink(ladderId: string, userId: string, day: string, sig: string): Promise<boolean> {
  if (!UUID.test(ladderId) || !UUID.test(userId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const today = nzTodayDateString();
  if (day > today || addDays(day, LINK_VALID_DAYS) < today) return false;
  const expected = await sign(ladderId, userId, day);
  return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export async function ladderLink(origin: string, ladderId: string, userId: string): Promise<string> {
  const day = nzTodayDateString();
  return `${origin}/l/${ladderId}/${userId}/${day}/${await sign(ladderId, userId, day)}`;
}
