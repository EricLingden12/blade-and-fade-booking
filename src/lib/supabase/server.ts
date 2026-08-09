import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";
import {
  supabaseAnonKey,
  supabaseServiceRoleKey,
  supabaseUrl,
} from "@/lib/env";

/**
 * Request-scoped client that carries the signed-in admin's session.
 * Subject to RLS, so it is safe to use for anything user-facing.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // `updateSession` in middleware already refreshes the session, so
          // this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only for trusted server work that the anon role legitimately cannot do:
 * reading a booking by its reference code, and reading staff schedules while
 * computing availability. Never expose its results wholesale to a caller.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    supabaseUrl(),
    supabaseServiceRoleKey(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
