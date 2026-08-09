import Image from "next/image";
import { CalendarDays, Clock, MapPin, Scissors, User } from "lucide-react";

import type { BookingDetail } from "@/lib/queries/bookings";
import { CURRENCY, SHOP } from "@/lib/shop";
import { formatDateLong, formatDuration, formatTimeRange } from "@/lib/time";
import { cn } from "@/lib/utils";

/** The at-a-glance appointment summary, shared by confirmation and lookup. */
export function BookingCard({ booking }: { booking: BookingDetail }) {
  const cancelled = booking.status === "cancelled";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-white/12 bg-ink-900",
        cancelled && "opacity-75",
      )}
    >
      <div className="flex items-center gap-4 border-b border-white/10 bg-ink-800 px-5 py-4 sm:px-6">
        <span className="relative size-11 shrink-0 overflow-hidden rounded-full bg-ink-700">
          {booking.staffAvatarUrl && (
            <Image
              src={booking.staffAvatarUrl}
              alt=""
              fill
              sizes="2.75rem"
              className="object-cover"
            />
          )}
        </span>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold uppercase tracking-wide text-ink-50">
            {booking.serviceName}
          </p>
          <p className="text-sm text-ink-400">with {booking.staffName}</p>
        </div>
        <span className="ml-auto shrink-0 font-display text-xl font-semibold tabular-nums text-brand-400">
          {CURRENCY.format(booking.servicePrice)}
        </span>
      </div>

      <dl className="divide-y divide-white/10">
        <Row icon={CalendarDays} label="Date">
          {formatDateLong(booking.startsAt)}
        </Row>
        <Row icon={Clock} label="Time">
          {formatTimeRange(booking.startsAt, booking.endsAt)}
          <span className="text-ink-500">
            {" "}
            · {formatDuration(booking.serviceDuration)}
          </span>
        </Row>
        <Row icon={User} label="Booked for">
          {booking.customerName}
        </Row>
        <Row icon={MapPin} label="Where">
          {SHOP.addressLines.join(", ")}
        </Row>
        {booking.notes && (
          <Row icon={Scissors} label="Your notes">
            {booking.notes}
          </Row>
        )}
      </dl>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3.5 px-5 py-4 sm:px-6">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />
      <dt className="w-24 shrink-0 text-sm text-ink-500">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm font-medium text-ink-100">
        {children}
      </dd>
    </div>
  );
}
