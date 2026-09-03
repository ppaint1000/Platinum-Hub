import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  if (isPublicAsset) return response;

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdminOrSupervisor = profile?.role === "admin" || profile?.role === "supervisor";

    const url = request.nextUrl.clone();
    url.pathname = isAdminOrSupervisor ? "/hub" : "/fleet/log";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdminOrSupervisor = profile?.role === "admin" || profile?.role === "supervisor";

    // Drivers (and any other non-admin/supervisor role) are confined to
    // the fuel/mileage entry route — that's the whole point of the
    // restriction, enforced server-side here as well as by RLS, not just
    // hidden in the UI.
    if (!isAdminOrSupervisor && !path.startsWith("/fleet/log")) {
      const url = request.nextUrl.clone();
      url.pathname = "/fleet/log";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
