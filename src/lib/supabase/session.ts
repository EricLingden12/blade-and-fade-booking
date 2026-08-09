import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/database.types";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Refreshes the Supabase auth cookie and gates `/admin/*`.
 *
 * Returning the *same* response object that the Supabase client wrote cookies
 * onto is load-bearing — build a fresh `NextResponse` and the refreshed session
 * is silently dropped, logging the admin out on every navigation.
 *
 * Failures here are contained rather than thrown. A missing environment
 * variable or an unreachable Supabase would otherwise 500 every admin route
 * *including the login page*, which is precisely the page someone needs when
 * things are broken. Instead: no session means no access, so protected routes
 * bounce to login and the login page itself always renders.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginRoute = pathname === "/admin/login";
  const isAdminRoute = pathname.startsWith("/admin");

  let response = NextResponse.next({ request });

  function redirectToLogin() {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    if (pathname !== "/admin") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  let user = null;

  try {
    const supabase = createServerClient<Database>(
      supabaseUrl(),
      supabaseAnonKey(),
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      },
    );

    // Do not insert logic between client creation and `getUser()` — anything
    // that returns early here leaves the session unrefreshed.
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    // Surfaces in the platform logs with the real cause, which React's
    // production error masking would otherwise hide entirely.
    console.error(
      "[auth] Session refresh failed. Check NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY, and see /api/health.",
      error,
    );
    // Fail closed for protected routes, but never break the login page.
    return isLoginRoute ? response : redirectToLogin();
  }

  if (isAdminRoute && !isLoginRoute && !user) return redirectToLogin();

  if (isLoginRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
