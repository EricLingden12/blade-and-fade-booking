/**
 * Verifies the two guarantees that only a live database can prove:
 *
 *   1. the exclusion constraint really does reject a concurrent double-book;
 *   2. Row Level Security really does stop the anon role reading bookings.
 *
 *   npm run check:db
 *
 * Talks to Supabase over plain HTTP with both keys, so it tests the same path
 * the browser and the server actually take. Cleans up everything it inserts.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !secretKey) {
  console.error("Missing Supabase env vars. Check .env.local.");
  process.exit(1);
}

let failures = 0;

function check(label: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`${pass ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function headers(key: string, extra: Record<string, string> = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

const asAnon = (path: string, init: RequestInit = {}) =>
  fetch(`${url}/rest/v1/${path}`, { ...init, headers: headers(anonKey!, (init.headers as Record<string, string>) ?? {}) });

const asAdmin = (path: string, init: RequestInit = {}) =>
  fetch(`${url}/rest/v1/${path}`, { ...init, headers: headers(secretKey!, (init.headers as Record<string, string>) ?? {}) });

async function main() {
  // -------------------------------------------------------------------------
  console.log("\n— Row Level Security: what anon may read —\n");

  {
    const res = await asAnon("services?select=id,name,is_active");
    const rows = res.ok ? await res.json() : [];
    check("anon can read services", res.ok, `${rows.length} rows`);
    check(
      "anon sees only active services",
      Array.isArray(rows) && rows.every((r: { is_active: boolean }) => r.is_active),
    );
  }

  {
    const res = await asAnon("staff?select=id,name,is_active");
    const rows = res.ok ? await res.json() : [];
    check("anon can read staff", res.ok, `${rows.length} rows`);
    check(
      "anon sees only active staff",
      Array.isArray(rows) && rows.every((r: { is_active: boolean }) => r.is_active),
    );
  }

  console.log("\n— Row Level Security: what anon must NOT read —\n");

  for (const table of [
    "bookings",
    "staff_services",
    "working_hours",
    "time_off",
  ]) {
    const res = await asAnon(`${table}?select=*`);
    const body = await res.text();
    let leaked = 0;
    try {
      const parsed = JSON.parse(body);
      if (Array.isArray(parsed)) leaked = parsed.length;
    } catch {
      /* an error object, not rows */
    }
    check(
      `anon cannot read ${table}`,
      leaked === 0,
      leaked === 0 ? `HTTP ${res.status}` : `LEAKED ${leaked} ROWS`,
    );
  }

  // Confirm there really is data being hidden, so the checks above aren't
  // passing simply because the table is empty.
  {
    const res = await asAdmin("bookings?select=id");
    const rows = await res.json();
    check(
      "…and bookings is genuinely non-empty (service role sees them)",
      Array.isArray(rows) && rows.length > 0,
      `${rows.length} rows hidden from anon`,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n— Row Level Security: what anon may write —\n");

  const [{ id: serviceId }] = await (
    await asAdmin("services?select=id&is_active=eq.true&limit=1")
  ).json();
  const [{ id: staffId }] = await (
    await asAdmin("staff?select=id&is_active=eq.true&limit=1")
  ).json();

  // A far-future hour nothing else touches, so it can't collide with seed data.
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + 120);
  base.setUTCHours(3, 0, 0, 0);
  const startsAt = base.toISOString();
  const endsAt = new Date(base.getTime() + 30 * 60_000).toISOString();

  const customer = {
    customer_name: "RLS Probe",
    customer_email: "rls.probe@example.com",
    customer_phone: "+971 50 000 0000",
  };

  const createdIds: string[] = [];

  {
    // Deliberately no `Prefer: return=representation`: echoing the row back
    // requires SELECT, which anon does not have and must not have. A customer
    // creates a booking blind; the server reads it back with the service key.
    const res = await asAnon("bookings", {
      method: "POST",
      body: JSON.stringify({
        service_id: serviceId,
        staff_id: staffId,
        ...customer,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "confirmed",
      }),
    });
    const detail = res.status === 201 ? "" : await res.text();
    check("anon can create a booking", res.status === 201, `HTTP ${res.status} ${detail}`);

    // Asking for the row back must fail, for exactly that reason.
    const echo = await asAnon("bookings", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        service_id: serviceId,
        staff_id: staffId,
        ...customer,
        starts_at: new Date(base.getTime() + 3_600_000).toISOString(),
        ends_at: new Date(base.getTime() + 5_400_000).toISOString(),
        status: "confirmed",
      }),
    });
    const echoBody = await echo.json().catch(() => null);
    check(
      "anon asking for the row back is denied, not leaked",
      echo.status === 401 &&
        echoBody?.code === "42501" &&
        !JSON.stringify(echoBody).includes("reference_code"),
      `HTTP ${echo.status} ${echoBody?.code ?? ""}`,
    );

    // Verify through the service key what anon just wrote.
    const written = await (
      await asAdmin(
        `bookings?select=id,reference_code,status&customer_email=eq.${customer.customer_email}`,
      )
    ).json();
    check(
      "…the booking really landed in the table",
      Array.isArray(written) && written.length > 0,
      `${written.length ?? 0} rows`,
    );
    check(
      "…and the DB trigger assigned a valid reference code",
      written[0] && /^BF-[ACDEFGHJKMNPQRTUVWXY34679]{6}$/.test(written[0].reference_code),
      written[0]?.reference_code ?? "none",
    );
    for (const row of written ?? []) createdIds.push(row.id);
  }

  {
    // The WITH CHECK clause should refuse a booking in the past.
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const res = await asAnon("bookings", {
      method: "POST",
      body: JSON.stringify({
        service_id: serviceId,
        staff_id: staffId,
        ...customer,
        starts_at: past,
        ends_at: new Date(Date.now() - 86_400_000 + 1_800_000).toISOString(),
        status: "confirmed",
      }),
    });
    check("anon cannot backdate a booking", res.status >= 400, `HTTP ${res.status}`);
  }

  {
    // …or self-approve one as completed.
    const res = await asAnon("bookings", {
      method: "POST",
      body: JSON.stringify({
        service_id: serviceId,
        staff_id: staffId,
        ...customer,
        starts_at: new Date(base.getTime() + 7_200_000).toISOString(),
        ends_at: new Date(base.getTime() + 9_000_000).toISOString(),
        status: "completed",
      }),
    });
    check(
      "anon cannot create a pre-completed booking",
      res.status >= 400,
      `HTTP ${res.status}`,
    );
  }

  // -------------------------------------------------------------------------
  console.log("\n— Double-booking: the exclusion constraint —\n");

  {
    // Same barber, same minute, fired together. Exactly one must win.
    const clash = new Date(base.getTime() + 86_400_000);
    const cStart = clash.toISOString();
    const cEnd = new Date(clash.getTime() + 45 * 60_000).toISOString();

    const attempt = (name: string) =>
      asAdmin("bookings", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          service_id: serviceId,
          staff_id: staffId,
          customer_name: name,
          customer_email: "race@example.com",
          customer_phone: "+971 50 111 1111",
          starts_at: cStart,
          ends_at: cEnd,
          status: "confirmed",
        }),
      });

    const [a, b] = await Promise.all([attempt("Racer A"), attempt("Racer B")]);
    const bodies = await Promise.all([a.json(), b.json()]);
    const statuses = [a.status, b.status];

    const wins = statuses.filter((s) => s === 201).length;
    const losers = bodies.filter(
      (body) => !Array.isArray(body) && body?.code === "23P01",
    );

    check(
      "exactly one of two simultaneous bookings succeeds",
      wins === 1,
      `statuses ${statuses.join(" / ")}`,
    );
    check(
      "the loser is rejected by the exclusion constraint (23P01)",
      losers.length === 1,
      losers[0]?.message?.slice(0, 60) ?? "no 23P01 returned",
    );

    for (const body of bodies) {
      if (Array.isArray(body) && body[0]?.id) createdIds.push(body[0].id);
    }

    // An overlapping (not identical) booking must fail too.
    const overlap = await asAdmin("bookings", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        service_id: serviceId,
        staff_id: staffId,
        customer_name: "Overlapper",
        customer_email: "overlap@example.com",
        customer_phone: "+971 50 222 2222",
        // Starts 15 min into the winner's slot.
        starts_at: new Date(clash.getTime() + 15 * 60_000).toISOString(),
        ends_at: new Date(clash.getTime() + 60 * 60_000).toISOString(),
        status: "confirmed",
      }),
    });
    const overlapBody = await overlap.json();
    check(
      "a partially overlapping booking is also rejected",
      overlap.status >= 400 && overlapBody?.code === "23P01",
      `HTTP ${overlap.status}`,
    );
    if (Array.isArray(overlapBody) && overlapBody[0]?.id) {
      createdIds.push(overlapBody[0].id);
    }

    // Cancelling frees the slot: the constraint is WHERE status <> 'cancelled'.
    const winner = bodies.find((body) => Array.isArray(body))?.[0];
    if (winner) {
      await asAdmin(`bookings?id=eq.${winner.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });
      const rebook = await asAdmin("bookings", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          service_id: serviceId,
          staff_id: staffId,
          customer_name: "Rebooker",
          customer_email: "rebook@example.com",
          customer_phone: "+971 50 333 3333",
          starts_at: cStart,
          ends_at: cEnd,
          status: "confirmed",
        }),
      });
      const rebookBody = await rebook.json();
      check(
        "cancelling a booking frees its slot immediately",
        rebook.status === 201,
        `HTTP ${rebook.status}`,
      );
      if (Array.isArray(rebookBody) && rebookBody[0]?.id) {
        createdIds.push(rebookBody[0].id);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Clean up every probe row so the demo data stays pristine.
  for (const id of createdIds) {
    await asAdmin(`bookings?id=eq.${id}`, { method: "DELETE" });
  }
  await asAdmin("bookings?customer_email=eq.rls.probe@example.com", {
    method: "DELETE",
  });
  console.log(`\n· cleaned up ${createdIds.length} probe bookings`);

  console.log(failures === 0 ? "\nALL PASS\n" : `\n${failures} FAILURE(S)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
