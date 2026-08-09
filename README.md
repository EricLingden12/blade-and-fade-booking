# Blade & Fade Barbershop — online booking

A full-stack appointment booking site for a three-chair barbershop in Bur Dubai.
Customers book a chair in about a minute with no account; the owner manages
bookings, services, barbers and schedules from a private admin dashboard.

> Portfolio project. Fictional business, real engineering.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database / Auth | Supabase (Postgres + Row Level Security) |
| Validation | Zod 4 |
| Dates | date-fns + date-fns-tz |
| Hosting | Vercel |

---

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in your Supabase keys
```

**1. Create the schema.** Open the Supabase SQL editor, paste the whole of
[`supabase/schema.sql`](supabase/schema.sql), and run it. It's idempotent — safe
to re-run whenever you change it.

`schema.sql` is the complete, current schema, so a fresh database needs nothing
else. The numbered files in [`supabase/migrations/`](supabase/migrations) exist
only for a database created before a given feature: run the ones you're missing,
in order. Each is idempotent too.

**2. Turn off public sign-ups.** Supabase → Authentication → Providers → Email →
disable *Allow new users to sign up*. The admin policies treat "authenticated"
as "staff", so this is what stops anyone signing themselves into your dashboard.

**3. Seed it.**

```bash
npm run seed
```

Creates 5 services, 3 barbers with hours and service assignments, 2 time-off
blocks, a fortnight of realistic bookings, and the admin user from
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

**4. Run it.**

```bash
npm run dev        # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run seed` | Wipe and reseed the database |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run check` | Timezone + availability rules (no database needed) |
| `npm run check:db` | RLS and the double-booking constraint, against your live database |

### Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | Safe to expose; RLS gates it |
| `SUPABASE_SERVICE_ROLE_KEY` | same | **Server only.** Bypasses RLS |
| `NEXT_PUBLIC_SITE_URL` | — | Optional; derived from `VERCEL_URL` in production |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | you choose | Seed script only |

---

## How it works

### Time

The shop runs on a fixed timezone, **Asia/Dubai**. Every instant is stored as
`timestamptz` (UTC) and converted at the edges. All conversion goes through
[`src/lib/time.ts`](src/lib/time.ts), which draws a hard line between two things
that are easy to conflate:

- an **instant** — an absolute point in time, what goes in a `timestamptz`;
- a **day key** — `yyyy-MM-dd` in *shop* time, what a customer means by
  "Tuesday".

Nothing outside that module calls `new Date()` on a wall-clock string. Slot
generation iterates in wall-clock minutes and converts each candidate to an
instant, rather than doing millisecond arithmetic from a UTC anchor — the latter
drifts across a DST boundary. Dubai has no DST, but the engine doesn't rely on
that.

### The availability engine

[`src/lib/availability.ts`](src/lib/availability.ts). Given a service, a barber
(or "any"), and a day, it returns open start times:

1. the barber's `working_hours` for that weekday (multiple shifts per day are
   supported — Omar works a split shift on Saturdays);
2. candidates every 15 minutes, snapped to a clean grid, where
   `start + duration` still fits inside the shift;
3. minus anything overlapping a non-cancelled booking, **padded by a 10-minute
   turnover buffer on both sides**;
4. minus anything inside a `time_off` block (no buffer — leave is hard);
5. minus anything before now + a 30-minute lead time;
6. for "any available", the union across every barber who offers the service.

It runs server-side only and reads through the service-role client, because
working hours, time off, and other people's bookings are all invisible to the
anon role by design. The browser gets start times and nothing else — never which
barber is free, and never anyone else's booking.

### Verification

`npm run check` drives the pure logic directly — 94 assertions across four
suites, no database and no network:

| Suite | Covers |
| --- | --- |
| `tz` | UTC↔Dubai conversion, day rollover, day-key round trips |
| `availability` | the 15-minute grid, turnover buffer, lead time, leave, split shifts, the "any barber" union |
| `hours` | shop opening hours, calendar closures, and clamping a barber's shift to them |
| `location` | parsing pasted map links into coordinates, and building map/directions URLs |

The timezone half passes with the *server* clock set to Los Angeles, Kiritimati,
Midway and Lord Howe (a half-hour offset), so nothing depends on the host
machine's timezone.

`npm run check:db` proves the two things only a live Postgres can: that two
simultaneous bookings for the same chair cannot both succeed, and that the anon
role cannot read the bookings table. It cleans up everything it inserts.

### Double-booking is prevented by the database

Not by application code. `bookings` carries a Postgres exclusion constraint:

```sql
EXCLUDE USING gist (
  staff_id WITH =,
  tstzrange(starts_at, ends_at) WITH &&
) WHERE (status <> 'cancelled')
```

Two customers confirming the same slot in the same millisecond cannot both
succeed — the loser's `INSERT` raises `23P01`, which
[`createBookingAction`](src/app/(site)/book/actions.ts) catches and turns into
"someone just took that slot". Cancelled bookings are excluded from the
constraint, so cancelling puts the time straight back into availability.

Booking creation has three overlapping layers of defence:

1. Zod re-validates every field server-side — the client form is a convenience,
   not a gate;
2. availability is **recomputed on the server** and the requested slot must
   appear in it, so a crafted request for a closed Sunday dies here;
3. the exclusion constraint settles genuine races, which no amount of checking
   in step 2 can prevent.

For "any available", if one barber loses the race the action retries against the
next free one — a race only fails the customer when the slot is genuinely gone.

### Row Level Security

Two audiences, defined explicitly in `schema.sql` (grants are revoked first
rather than inherited from Supabase's permissive defaults):

| | anon | authenticated |
| --- | --- | --- |
| `services`, `staff` | `SELECT` where active | full |
| `staff_services`, `working_hours`, `time_off` | — | full |
| `bookings` | `INSERT` only | full |

**anon has no `SELECT` policy on bookings at all.** A customer cannot read back
any booking, including their own. The confirmation screen and the
`/booking/[reference]` lookup are served by server code holding the service key,
where knowing the 6-character code is the entire authorisation.

The anon insert policy also rejects anything pre-approved, backdated, or
claiming an absurd duration.

---

## Project layout

```
src/
  app/
    (site)/            public surface — dark charcoal, amber accent
      book/            the wizard, its server actions, confirmation
      booking/[ref]/   customer lookup + self-cancel
    admin/
      login/
      (dashboard)/     gated by proxy.ts *and* a session check in the layout
  components/
    booking/           wizard steps
    admin/             dashboard widgets and editors
    site/              marketing chrome
    ui/                shadcn/ui primitives
  lib/
    availability.ts    slot generation — the core of the app
    slots.ts           the pure slot maths, separately checked
    time.ts            the only place shop-timezone conversion happens
    shop.ts            booking rules and fixed shop details
    money.ts           currency list and price formatting
    location.ts        map-link parsing and directions URLs
    queries/           server-side reads, split by audience
    supabase/          browser / server / service-role clients
supabase/
  schema.sql           tables, constraints, RLS — run this first
  migrations/          incremental upgrades for an existing database
scripts/
  seed.ts              demo data
  __checks__/          the four verification suites
```

### What the owner can change without a deploy

Currency, address and map pin live in `shop_settings`; opening hours and holiday
closures live in `shop_hours` and `shop_closures`. All of them are editable from
`/admin`, and every read falls back to a sensible default rather than throwing,
so a missing row can never take the site down.

Opening hours are the outer boundary for availability: a barber's shift is
clamped to them, so a rota that runs past closing stops selling at closing.

### A note on theming

The public site renders inside a `dark` wrapper so shadcn primitives land on
charcoal instead of white; the admin dashboard omits it and stays light. Because
Radix portals render outside that subtree, the booking flow deliberately avoids
portaled components — the date picker is inline (better on mobile anyway) and
the cancel confirmation is a two-tap inline control rather than a dialog. Toasts
are mounted per-surface with an explicit theme.

---

## Deploying to Vercel

1. Push to GitHub and import the repo at [vercel.com/new](https://vercel.com/new).
   Framework preset and build command are detected automatically.
2. Add the environment variables under **Settings → Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — make sure this one is **not** exposed to the
     browser; never rename it with a `NEXT_PUBLIC_` prefix
   - `NEXT_PUBLIC_SITE_URL` is optional; it falls back to `VERCEL_URL`
3. Deploy. Every route that touches Supabase is dynamic, so there's nothing to
   revalidate at build time.
4. In Supabase → Authentication → URL Configuration, add your Vercel domain to
   **Site URL** and **Redirect URLs**.

### Before making the repo public

- **Rotate your Supabase keys** if they've ever been pasted anywhere they
  shouldn't be (chat, a screenshot, a commit). Settings → API Keys → rotate,
  then update `.env.local` and Vercel.
- Confirm `.env.local` is untracked — `git check-ignore .env.local` should print
  the file name.
- Confirm public sign-ups are disabled in Supabase Auth.

---

## Known scope limits

Deliberate, per the brief:

- **No payments.** The flow is free-to-book; you settle up at the shop.
- **No customer accounts.** Customer details live on the booking row.
- **No transactional email.** The confirmation screen and reference code stand in
  for the email that a real deployment would send — wiring up Resend would be the
  natural next step, and `getBookingByReference` is already the right seam for it.
- **Rescheduling is cancel-and-rebook.** Moving a booking in place would need
  its own availability check against the new slot.
