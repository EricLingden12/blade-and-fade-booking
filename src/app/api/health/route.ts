import { NextResponse } from "next/server";

/**
 * Deployment diagnostics.
 *
 * React masks server-render errors in production behind "Minified React error
 * #441", which makes a misconfigured deploy nearly impossible to diagnose from
 * the outside. This reports the two things that actually go wrong — missing
 * environment variables, and an unreachable database — without ever echoing a
 * secret. Values are reported as booleans and lengths only.
 */
export const dynamic = "force-dynamic";

function describe(value: string | undefined) {
  return { present: Boolean(value), length: value?.length ?? 0 };
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: {
      ...describe(url),
      // The host is not a secret and is the single most useful thing to see.
      host: url ? safeHost(url) : null,
    },
    NEXT_PUBLIC_SUPABASE_ANON_KEY: describe(anon),
    SUPABASE_SERVICE_ROLE_KEY: describe(service),
  };

  const missing = Object.entries(env)
    .filter(([, value]) => !value.present)
    .map(([name]) => name);

  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        problem: "missing_env",
        missing,
        hint: "Add these in Vercel → Settings → Environment Variables, then redeploy WITHOUT the build cache. NEXT_PUBLIC_* values are inlined at build time, so adding them does not fix an existing deployment.",
        env,
      },
      { status: 503 },
    );
  }

  // Env is present — can we actually reach the database?
  let database: { ok: boolean; status?: number; error?: string };
  try {
    const response = await fetch(
      `${url}/rest/v1/services?select=id&limit=1`,
      {
        headers: { apikey: anon!, Authorization: `Bearer ${anon!}` },
        cache: "no-store",
      },
    );
    database = response.ok
      ? { ok: true, status: response.status }
      : {
          ok: false,
          status: response.status,
          error: (await response.text()).slice(0, 200),
        };
  } catch (error) {
    database = { ok: false, error: (error as Error).message.slice(0, 200) };
  }

  return NextResponse.json(
    { ok: database.ok, env, database },
    { status: database.ok ? 200 : 503 },
  );
}

function safeHost(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return "unparseable";
  }
}
