// The sign-in log, "one device at a time" and the new-device email, run
// from the request gate (lib/supabase/proxy.ts). The first request of each
// sign-in (Supabase auth session) records it via hub_record_sign_in
// (supabase/sign_in_log.sql); a cookie remembers it's been done so later
// requests cost nothing extra.
import type { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Which browser this is - set once, kept for two years.
export const DEVICE_COOKIE = "hub_device";
// The sign-in this browser last recorded. Also how the sign-in page knows
// someone was signed out (e.g. by signing in on another device) rather
// than never signed in. Not secret - just the session's id.
export const SESSION_COOKIE = "hub_sess";

const YEAR = 60 * 60 * 24 * 365;

function sessionIdOf(accessToken: string | undefined): string | null {
  if (!accessToken) return null;
  try {
    const part = accessToken.split(".")[1];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="));
    return (JSON.parse(json) as { session_id?: string }).session_id ?? null;
  } catch {
    return null;
  }
}

function decode(v: string | null): string | null {
  if (!v) return null;
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export async function recordSignIn(
  supabase: SupabaseClient,
  request: NextRequest,
  response: NextResponse,
  event: NextFetchEvent | undefined
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const sessionId = sessionIdOf(session?.access_token);
  if (!sessionId || request.cookies.get(SESSION_COOKIE)?.value === sessionId) return;

  let device = request.cookies.get(DEVICE_COOKIE)?.value;
  if (!device) {
    device = crypto.randomUUID();
    response.cookies.set(DEVICE_COOKIE, device, { maxAge: 2 * YEAR, httpOnly: true, sameSite: "lax", secure: true, path: "/" });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
  const { data, error } = await supabase.rpc("hub_record_sign_in", {
    p_device: device,
    p_user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
    p_ip: ip,
    p_city: decode(request.headers.get("x-vercel-ip-city")),
    p_country: request.headers.get("x-vercel-ip-country"),
  });
  if (error) {
    console.error("sign-in log:", error.message);
    return;
  }
  const r = data as { ok: boolean; already_recorded?: boolean; new_device?: boolean; multi_device?: boolean };
  if (!r?.ok) return;

  response.cookies.set(SESSION_COOKIE, sessionId, { maxAge: YEAR, sameSite: "lax", secure: true, path: "/" });
  if (r.already_recorded) return;

  // One device at a time: end this person's other sign-ins. Their next
  // request there fails Supabase's session check and lands on sign-in.
  if (!r.multi_device) {
    const { error: outError } = await supabase.auth.signOut({ scope: "others" });
    if (outError) console.error("sign-in log: signing out other devices failed:", outError.message);
  }

  // Email admins about a new device - after the response, so the person
  // signing in doesn't wait for it. Sent with their own sign-in, which the
  // route checks is the one being reported.
  if (r.new_device) {
    const send = fetch(`${request.nextUrl.origin}/api/security/new-device`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: request.headers.get("cookie") ?? "" },
      body: JSON.stringify({ sessionId }),
    }).catch((e) => console.error("sign-in log: new-device email failed:", e));
    if (event) event.waitUntil(send);
    else await send;
  }
}
