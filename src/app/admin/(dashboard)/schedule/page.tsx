import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";

import { ClosuresList } from "@/components/admin/closures-editor";
import { TimeOffList, WeeklyHours } from "@/components/admin/schedule-editor";
import { ShopHoursEditor } from "@/components/admin/shop-hours-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  listClosures,
  listShopHours,
  listStaff,
  listTimeOff,
  listWorkingHours,
} from "@/lib/queries/admin";
import { SHOP_TIMEZONE } from "@/lib/shop";

export const metadata: Metadata = { title: "Schedule" };

export default async function AdminSchedulePage() {
  const [staff, hours, timeOff, shopHours, closures] = await Promise.all([
    listStaff(),
    listWorkingHours(),
    listTimeOff(),
    listShopHours(),
    listClosures(),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-12">
      <div>
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">
          Schedule
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          When the shop is open, and who is in. All times are shop time (
          {SHOP_TIMEZONE}).
        </p>
      </div>

      <Section
        title="Opening hours"
        blurb="The hours the shop itself is open. Everything else fits inside these."
      >
        {shopHours.length === 7 ? (
          <ShopHoursEditor hours={shopHours} />
        ) : (
          <MissingHoursNotice />
        )}
      </Section>

      <Section
        title="Closed days"
        blurb="Holidays and one-off shutdowns. These close the shop for every barber at once."
      >
        <ClosuresList closures={closures} />
      </Section>

      {staff.length === 0 ? (
        <Section
          title="Barbers"
          blurb="Rotas and leave belong to a barber, so there's nothing to set up yet."
        >
          <Card>
            <CardContent className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Users className="size-7 text-muted-foreground/60" aria-hidden />
              <p className="font-medium">Add a barber first</p>
              <Button asChild className="mt-3">
                <Link href="/admin/staff">Go to barbers</Link>
              </Button>
            </CardContent>
          </Card>
        </Section>
      ) : (
        <>
          <Section
            title="Time off"
            blurb="One barber away — a holiday, a dentist appointment, a sick day."
          >
            <TimeOffList staff={staff} timeOff={timeOff} />
          </Section>

          <Section
            title="Barber rotas"
            blurb="Which barber works which hours. Trimmed to the shop's opening hours above."
          >
            <WeeklyHours staff={staff} hours={hours} />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-lg font-semibold uppercase tracking-wide">
        {title}
      </h2>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">{blurb}</p>
      {children}
    </section>
  );
}

/** Shown when the migration that creates `shop_hours` hasn't been run yet. */
function MissingHoursNotice() {
  return (
    <Card>
      <CardContent className="space-y-2 px-6 py-8 text-sm">
        <p className="font-medium">Opening hours aren&rsquo;t set up yet</p>
        <p className="text-muted-foreground">
          Run <code className="text-xs">supabase/migrations/0003_shop_hours.sql</code>{" "}
          in the Supabase SQL editor. Until then the site falls back to its
          original hours and bookings are limited by barber rotas alone.
        </p>
      </CardContent>
    </Card>
  );
}
