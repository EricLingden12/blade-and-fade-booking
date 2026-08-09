import "server-only";

/** PostgREST's code for "that relation isn't in the schema cache" — i.e. the
 *  table doesn't exist. Its own message doesn't hint at the cause, so we do. */
const TABLE_MISSING = "PGRST205";

type SupabaseError = { message: string; code?: string } | null;

/**
 * One place to log a failed query, so a missing schema reads as a setup step
 * rather than a mystery. Every caller degrades to an empty result — a booking
 * site that renders "no services" is recoverable; one that throws is not.
 */
export function reportQueryError(context: string, error: SupabaseError): void {
  if (!error) return;

  if (error.code === TABLE_MISSING) {
    console.error(
      `[${context}] Database tables are missing.\n` +
        `  → Paste supabase/schema.sql into the Supabase SQL editor and run it,\n` +
        `    then run: npm run seed`,
    );
    return;
  }

  console.error(`[${context}] ${error.message}`);
}
