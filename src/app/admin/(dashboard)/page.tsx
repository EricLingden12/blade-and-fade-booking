import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Inbox,
} from "lucide-react";

import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboard, type AdminBooking } from "@/lib/queries/admin";
import { formatMoney } from "@/lib/money";
import { getCurrency } from "@/lib/queries/settings";
import {
  formatDate,
  formatDateLong,
  formatTime,
  formatTimeRange,
  toDayKey,
} from "@/lib/time";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const [{ todaysBookings, upcoming, stats, now: snapshot, today }, currency] =
    await Promise.all([getDashboard(), getCurrency()]);

  // "Later today" excludes anything already finished, so the list shrinks as
  // the day goes on rather than sitting there stale. Uses the snapshot instant
  // the queries ran at, not a fresh clock read during render.
  const now = new Date(snapshot).getTime();
  const remainingToday = todaysBookings.filter(
    (booking) =>
      booking.status !== "cancelled" &&
      new Date(booking.endsAt).getTime() >= now,
  );

  const laterThisWeek = upcoming.filter(
    (booking) => toDayKey(booking.startsAt) !== today,
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">
          Today
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDateLong(snapshot)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={CalendarDays}
          label="Bookings today"
          value={String(stats.todayCount)}
          hint={`${remainingToday.length} still to come`}
        />
        <Stat
          icon={CalendarClock}
          label="This week"
          value={String(stats.weekCount)}
          hint="Mon – Sun"
        />
        <Stat
          icon={CircleDollarSign}
          label="Expected this week"
          value={formatMoney(stats.weekRevenue, currency)}
          hint="Confirmed + completed"
        />
        <Stat
          icon={Inbox}
          label="Awaiting confirmation"
          value={String(stats.pendingCount)}
          hint={stats.pendingCount > 0 ? "Needs a look" : "All clear"}
          emphasis={stats.pendingCount > 0}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Today&rsquo;s chair</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/bookings">
                All bookings
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {todaysBookings.length === 0 ? (
              <Empty
                icon={Clock3}
                title="Nothing booked today"
                body="A quiet one. New bookings appear here the moment they come in."
              />
            ) : (
              <ol className="divide-y">
                {todaysBookings.map((booking) => (
                  <TodayRow key={booking.id} booking={booking} now={now} />
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coming up</CardTitle>
          </CardHeader>
          <CardContent>
            {laterThisWeek.length === 0 ? (
              <Empty
                icon={CalendarClock}
                title="Nothing on the books yet"
                body="Upcoming appointments beyond today will show up here."
              />
            ) : (
              <ol className="divide-y">
                {laterThisWeek.map((booking) => (
                  <li key={booking.id}>
                    <Link
                      href={`/admin/bookings/${booking.id}`}
                      className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="w-24 shrink-0 text-sm">
                        <p className="font-medium">
                          {formatDate(booking.startsAt)}
                        </p>
                        <p className="tabular-nums text-muted-foreground">
                          {formatTime(booking.startsAt)}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {booking.customerName}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {booking.serviceName} · {booking.staffName}
                        </p>
                      </div>
                      <StatusBadge status={booking.status} />
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TodayRow({ booking, now }: { booking: AdminBooking; now: number }) {
  const finished = new Date(booking.endsAt).getTime() < now;
  const inProgress =
    !finished && new Date(booking.startsAt).getTime() <= now;

  return (
    <li>
      <Link
        href={`/admin/bookings/${booking.id}`}
        className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/50"
      >
        <div className="w-28 shrink-0">
          <p className="text-sm font-medium tabular-nums">
            {formatTimeRange(booking.startsAt, booking.endsAt)}
          </p>
          {inProgress && (
            <p className="text-xs font-medium text-emerald-600">In the chair</p>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-medium ${
              booking.status === "cancelled" ? "line-through opacity-60" : ""
            }`}
          >
            {booking.customerName}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {booking.serviceName} · {booking.staffName}
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </Link>
    </li>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  emphasis,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-5">
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
            emphasis ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-0.5 font-display text-2xl font-semibold tabular-nums">
            {value}
          </p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function Empty({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <Icon className="size-6 text-muted-foreground/60" aria-hidden />
      <p className="font-medium">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
