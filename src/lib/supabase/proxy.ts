import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const TIMESHEETS_URL = "https://platinum-painters-timesheets.vercel.app";

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
  const isPublicAsset = path.startsWith("/_next") || path.startsWith("/favicon");
  // Server-to-server webhook from Measures (a separate app/Supabase
  // project — no Hub session cookie to check here). Auth is the shared
  // secret each route verifies itself, see src/lib/integrations/quotesWebhook.ts.
  const isIntegrationWebhook = path.startsWith("/api/integrations/");

  if (isPublicAsset || isIntegrationWebhook) return response;

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  if (user) {
    const [profileResult, accessResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("role, is_active")
        .eq("id", user.id)
        .single<Profile>(),
      supabase
        .from("user_app_access")
        .select("timesheets, fleet, orders, jobs, sales, default_app")
        .eq("user_id", user.id)
        .maybeSingle<AppAccess>(),
    ]);
    const { data: profile } = profileResult;
    const { data: access } = accessResult;

    // Deactivated (or deleted, since deleteUserAction falls back to this
    // when a restrict FK blocks a hard delete): a Supabase ban already stops
    // new sessions everywhere, but a token issued just before the ban can
    // still be valid for a short window — cut it off immediately here too.
    if (profile?.is_active === false) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      return NextResponse.redirect(url);
    }

    const isAdmin = profile?.role === "admin";
    const hasHubAccess =
      isAdmin || !!access?.fleet || !!access?.orders || !!access?.jobs || !!access?.sales;

    if (isAuthRoute) {
      const defaultApp = access?.default_app ?? "timesheets";
      const url = request.nextUrl.clone();

      if (defaultApp === "hub" && hasHubAccess) {
        url.pathname = "/hub";
        return NextResponse.redirect(url);
      }
      if (defaultApp === "fleet" && (isAdmin || access?.fleet)) {
        url.pathname = "/fleet";
        return NextResponse.redirect(url);
      }
      if (defaultApp === "orders" && (isAdmin || access?.orders)) {
        url.pathname = "/orders";
        return NextResponse.redirect(url);
      }
      if (defaultApp === "jobs" && (isAdmin || access?.jobs)) {
        url.pathname = "/jobs";
        return NextResponse.redirect(url);
      }
      if (defaultApp === "sales" && (isAdmin || access?.sales)) {
        url.pathname = "/sales";
        return NextResponse.redirect(url);
      }
      if (defaultApp === "timesheets") {
        return NextResponse.redirect(TIMESHEETS_URL);
      }
      // default_app pointed at an app the user no longer has (flag was
      // revoked after being set as default) — fall back sensibly.
      if (hasHubAccess) {
        url.pathname = "/hub";
        return NextResponse.redirect(url);
      }
      return NextResponse.redirect(TIMESHEETS_URL);
    }

    // Coarse "do they belong in this app at all" gate — which specific
    // route they can reach within the Hub is enforced per-page by
    // requireAppAccess/requireAdmin.
    if (!hasHubAccess) {
      return NextResponse.redirect(TIMESHEETS_URL);
    }
  }

  return response;
}
