import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck2, CircleSlash } from "lucide-react";

import { BookingCard } from "@/components/booking/booking-card";
import { CancelBooking } from "@/components/booking/cancel-booking";
import { Button } from "@/components/ui/button";
import { getBookingByReference } from "@/lib/queries/bookings";
import { getCurrency } from "@/lib/queries/settings";
import { SHOP } from "@/lib/shop";
import { formatDateLong, formatTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Your booking",
  robots: { index: false, follow: false },
};

export default async function BookingLookupPage(
  props: PageProps<"/booking/[reference]">,
) {
  const { reference } = await props.params;
  const [booking, currency] = await Promise.all([
    getBookingByReference(reference),
    getCurrency(),
  ]);
  if (!booking) notFound();

  const cancelled = booking.status === "cancelled";
  const past = booking.isPast;

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-14 sm:px-8 sm:py-20">
      <p className="eyebrow">Booking {booking.referenceCode}</p>

      <h1 className="mt-3 font-display text-4xl font-bold uppercase leading-none tracking-tight text-ink-50">
        {cancelled ? "Cancelled" : past ? "Past appointment" : "You're booked"}
      </h1>

      <p className="mt-4 text-base leading-relaxed text-ink-300">
        {cancelled ? (
          <>This appointment was cancelled. Book again whenever suits you.</>
        ) : past ? (
          <>
            This was on {formatDateLong(booking.startsAt)}. Hope the cut held
            up.
          </>
        ) : (
          <>
            {formatDateLong(booking.startsAt)} at{" "}
            {formatTime(booking.startsAt)}, with {booking.staffName}.
          </>
        )}
      </p>

      <div className="mt-8">
        <BookingCard booking={booking} currency={currency} />
      </div>

      {!cancelled && !past && (
        <div className="mt-8 rounded-xl border border-white/12 bg-ink-900 p-5">
          <h2 className="flex items-center gap-2 font-medium text-ink-100">
            <CalendarCheck2 className="size-4 text-brand-400" aria-hidden />
            Need to change it?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-400">
            We can&rsquo;t reschedule online yet. Cancel here and rebook, or
            call the shop on{" "}
            <a
              href={`tel:${SHOP.phone.replace(/\s/g, "")}`}
              className="font-medium text-brand-400 underline-offset-4 hover:underline"
            >
              {SHOP.phone}
            </a>{" "}
            and we&rsquo;ll move it for you.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <CancelBooking reference={booking.referenceCode} />
            <Button
              asChild
              variant="outline"
              className="border-white/20 bg-white/5 hover:bg-white/10"
            >
              <Link href="/book">Book another</Link>
            </Button>
          </div>
        </div>
      )}

      {(cancelled || past) && (
        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            asChild
            className="bg-brand-400 font-semibold text-ink-950 hover:bg-brand-300"
          >
            <Link href="/book">Book again</Link>
          </Button>
        </div>
      )}

      {cancelled && (
        <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-ink-500">
          <CircleSlash className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Cancelled slots go straight back into availability, so someone else
          may already have taken this time.
        </p>
      )}
    </div>
  );
}
