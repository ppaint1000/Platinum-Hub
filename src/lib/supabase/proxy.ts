import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { landingPath } from "@/lib/auth/landing";

type Profile = { role: string; is_active: boolean | null };
type AppAccess = {
  timesheets: boolean;
  fleet: boolean;
  orders: boolean;
  jobs: boolean;
  sales: boolean;
  default_app: string;
};

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute = path === "/sign-in";
  // /reset-password is reachable regardless of session state: the recovery
  // link's token is only exchanged for a session client-side (via the URL
  // hash), which this server-side check can't see yet on first load — and
  // an existing session shouldn't bounce someone away from it either.
  // /accept-invite is the same story, one step earlier — it hasn't
  // exchanged anything yet, it's the page that does that on a real click.
  const isAlwaysPublic = path === "/reset-password" || path === "/accept-invite";
  const isPublicAsset = path.startsWith("/_next") || path.startsWith("/favicon");
  // Server-to-server webhook from Measures (a separate app/Supabase
  // project — no Hub session cookie to check here). Auth is the shared
  // secret each route verifies itself, see src/lib/integrations/quotesWebhook.ts.
  const isIntegrationWebhook = path.startsWith("/api/integrations/");

  if (isPublicAsset || isIntegrationWebhook) return response;

  let verifiedUser = user;
  let profile: Profile | null = null;
  let access: AppAccess | null = null;

  if (user) {
    const [profileResult, accessResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", user.id)
        .maybeSingle<Profile>(),
      supabase
        .from("user_app_access")
        .select("timesheets, fleet, orders, jobs, sales, default_app")
        .eq("user_id", user.id)
        .maybeSingle<AppAccess>(),
    ]);

    // A valid auth session with no matching profiles row (deleted profile,
    // or any transient read failure) would otherwise redirect to /sign-in
    // below, then right back here next request since the session still
    // looks valid — an infinite loop with no way out short of manually
    // clearing cookies. Signing out here breaks that at the source: the
    // next request has no user, so it resolves to /sign-in cleanly.
    if (profileResult.error || !profileResult.data) {
      if (profileResult.error) {
        console.error("proxy: profile lookup failed for", user.id, profileResult.error.message);
      }
      await supabase.auth.signOut();
      verifiedUser = null;
    } else {
      profile = profileResult.data;
      access = accessResult.data;
    }
  }

  // getUser() already made the one network round-trip to Supabase Auth that
  // verifies this request's JWT. Stamp the verified id on the request so
  // downstream Server Components (getCurrentProfile) can skip repeating that
  // same round-trip on every single navigation. Rebuilding the response to
  // pick up the new request header would drop any session-refresh cookies
  // setAll already queued above, so carry those over explicitly. Build a
  // fresh Headers instance rather than mutating request.headers in place.
  if (verifiedUser) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-verified-user-id", verifiedUser.id);
    const refreshedCookies = response.cookies.getAll();
    response = NextResponse.next({ request: { headers: requestHeaders } });
    refreshedCookies.forEach((cookie) => response.cookies.set(cookie));
  }

  if (!verifiedUser && !isAuthRoute && !isAlwaysPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    // Carry over any Set-Cookie from the signOut() above (e.g. a broken
    // profile lookup) — a bare NextResponse.redirect() here would otherwise
    // drop those and leave the stale session cookie in place, so the next
    // request would just fail the same profile check all over again.
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  if (verifiedUser && profile) {
    // Deactivated (or deleted, since deleteUserAction falls back to this
    // when a restrict FK blocks a hard delete): a Supabase ban already stops
    // new sessions everywhere, but a token issued just before the ban can
    // still be valid for a short window — cut it off immediately here too.
    if (profile.is_active === false) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      return NextResponse.redirect(url);
    }

    // Sign-in sends everyone to "/", so "/" needs the same landing as
    // /sign-in. Painters are also kept off the Hub itself, and the
    // Dashboard is admin-only (the page checks this again server-side).
    const isPainterOnHub = profile.role === "painter" && path === "/hub";
    const isNonAdminOnDashboard =
      profile.role !== "admin" && (path === "/dashboard" || path.startsWith("/dashboard/"));

    if (isAuthRoute || path === "/" || isPainterOnHub || isNonAdminOnDashboard) {
      const url = request.nextUrl.clone();
      url.pathname = landingPath(profile.role, access);
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
