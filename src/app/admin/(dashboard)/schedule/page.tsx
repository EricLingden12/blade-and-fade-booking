import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";

import { TimeOffList, WeeklyHours } from "@/components/admin/schedule-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listStaff, listTimeOff, listWorkingHours } from "@/lib/queries/admin";
import { SHOP_TIMEZONE } from "@/lib/shop";

export const metadata: Metadata = { title: "Schedule" };

export default async function AdminSchedulePage() {
  const [staff, hours, timeOff] = await Promise.all([
    listStaff(),
    listWorkingHours(),
    listTimeOff(),
  ]);

  if (staff.length === 0) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Users className="size-7 text-muted-foreground/60" aria-hidden />
            <p className="font-medium">Add a barber first</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Working hours belong to a barber, so there&rsquo;s nothing to set
              up yet.
            </p>
            <Button asChild className="mt-3">
              <Link href="/admin/staff">Go to barbers</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">
          Schedule
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Weekly hours and one-off leave. All times are shop time (
          {SHOP_TIMEZONE}).
        </p>
      </div>

      <TimeOffList staff={staff} timeOff={timeOff} />

      <div>
        <h2 className="mb-4 font-display text-lg font-semibold uppercase tracking-wide">
          Weekly hours
        </h2>
        <WeeklyHours staff={staff} hours={hours} />
      </div>
    </div>
  );
}
