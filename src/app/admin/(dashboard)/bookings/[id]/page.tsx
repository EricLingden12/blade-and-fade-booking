import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail, Phone } from "lucide-react";

import { BookingActions } from "@/components/admin/booking-actions";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBooking } from "@/lib/queries/admin";
import { CURRENCY } from "@/lib/shop";
import {
  formatDateLong,
  formatDateTime,
  formatDuration,
  formatTimeRange,
} from "@/lib/time";

export const metadata: Metadata = { title: "Booking" };

export default async function AdminBookingDetailPage(
  props: PageProps<"/admin/bookings/[id]">,
) {
  const { id } = await props.params;
  const booking = await getBooking(id);
  if (!booking) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/bookings">
          <ArrowLeft className="size-3.5" />
          All bookings
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">
              {booking.customerName}
            </h1>
            <StatusBadge status={booking.status} />
          </div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {booking.referenceCode}
          </p>
        </div>

        <BookingActions id={booking.id} status={booking.status} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appointment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Date">{formatDateLong(booking.startsAt)}</Row>
            <Row label="Time">
              <span className="tabular-nums">
                {formatTimeRange(booking.startsAt, booking.endsAt)}
              </span>
            </Row>
            <Row label="Service">
              {booking.serviceName}
              <span className="block text-muted-foreground">
                {formatDuration(booking.serviceDuration)} ·{" "}
                {CURRENCY.format(booking.servicePrice)}
              </span>
            </Row>
            <Row label="Barber">
              <span className="flex items-center gap-2">
                {booking.staffAvatarUrl && (
                  <span className="relative size-6 overflow-hidden rounded-full bg-muted">
                    <Image
                      src={booking.staffAvatarUrl}
                      alt=""
                      fill
                      sizes="1.5rem"
                      className="object-cover"
                    />
                  </span>
                )}
                {booking.staffName}
              </span>
            </Row>
            <Row label="Booked">{formatDateTime(booking.createdAt)}</Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Name">{booking.customerName}</Row>
            <Row label="Email">
              <a
                href={`mailto:${booking.customerEmail}`}
                className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
              >
                <Mail className="size-3.5" aria-hidden />
                {booking.customerEmail}
              </a>
            </Row>
            <Row label="Phone">
              <a
                href={`tel:${booking.customerPhone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline"
              >
                <Phone className="size-3.5" aria-hidden />
                {booking.customerPhone}
              </a>
            </Row>
            {booking.notes && <Row label="Notes">{booking.notes}</Row>}
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground">
        <Link
          href={`/booking/${booking.referenceCode}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          View the customer&rsquo;s version of this booking
        </Link>
      </p>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 font-medium">{children}</span>
    </div>
  );
}
