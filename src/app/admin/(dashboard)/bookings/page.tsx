import type { Metadata } from "next";
import Link from "next/link";
import { CalendarSearch } from "lucide-react";

import { BookingFiltersBar } from "@/components/admin/booking-filters";
import { StatusBadge } from "@/components/admin/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BookingStatus } from "@/lib/database.types";
import { listBookings, listStaff } from "@/lib/queries/admin";
import { CURRENCY } from "@/lib/shop";
import { formatDate, formatTimeRange, isDayKey } from "@/lib/time";

export const metadata: Metadata = { title: "Bookings" };

const STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
];

function one(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw !== "all" ? raw : null;
}

export default async function AdminBookingsPage(
  props: PageProps<"/admin/bookings">,
) {
  const searchParams = await props.searchParams;

  const staffId = one(searchParams.staff);
  const statusParam = one(searchParams.status);
  const status = STATUSES.includes(statusParam as BookingStatus)
    ? (statusParam as BookingStatus)
    : null;
  const from = one(searchParams.from);
  const to = one(searchParams.to);
  const search = one(searchParams.q);

  const [bookings, staff] = await Promise.all([
    listBookings({
      staffId,
      status,
      from: from && isDayKey(from) ? from : null,
      to: to && isDayKey(to) ? to : null,
      search,
    }),
    listStaff(),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">
          Bookings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {bookings.length === 0
            ? "No bookings match these filters"
            : `${bookings.length} booking${bookings.length === 1 ? "" : "s"}`}
        </p>
      </div>

      <BookingFiltersBar staff={staff} />

      <Card>
        <CardContent className="p-0">
          {bookings.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <CalendarSearch
                className="size-7 text-muted-foreground/60"
                aria-hidden
              />
              <p className="font-medium">Nothing here</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Try widening the date range or clearing a filter.
              </p>
            </div>
          ) : (
            <>
              {/* Table on desktop, stacked cards on phones. */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Barber</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.map((booking) => (
                      <TableRow key={booking.id} className="cursor-pointer">
                        <TableCell className="whitespace-nowrap">
                          <Link
                            href={`/admin/bookings/${booking.id}`}
                            className="block after:absolute after:inset-0"
                          >
                            <span className="font-medium">
                              {formatDate(booking.startsAt)}
                            </span>
                            <span className="block text-xs tabular-nums text-muted-foreground">
                              {formatTimeRange(booking.startsAt, booking.endsAt)}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {booking.customerName}
                          </span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {booking.referenceCode}
                          </span>
                        </TableCell>
                        <TableCell>{booking.serviceName}</TableCell>
                        <TableCell>{booking.staffName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {CURRENCY.format(booking.servicePrice)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={booking.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ul className="divide-y md:hidden">
                {bookings.map((booking) => (
                  <li key={booking.id}>
                    <Link
                      href={`/admin/bookings/${booking.id}`}
                      className="flex flex-col gap-1.5 p-4 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium">{booking.customerName}</p>
                        <StatusBadge status={booking.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(booking.startsAt)} ·{" "}
                        <span className="tabular-nums">
                          {formatTimeRange(booking.startsAt, booking.endsAt)}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {booking.serviceName} · {booking.staffName} ·{" "}
                        {CURRENCY.format(booking.servicePrice)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
