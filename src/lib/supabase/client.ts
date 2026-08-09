import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/** Browser-side client. Anon key only — RLS decides what it can see. */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
