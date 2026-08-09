import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus, Check, Phone } from "lucide-react";

import { BookingCard } from "@/components/booking/booking-card";
import { CopyReference } from "@/components/booking/copy-reference";
import { Button } from "@/components/ui/button";
import { getBookingByReference } from "@/lib/queries/bookings";
import { getCurrency } from "@/lib/queries/settings";
import { SHOP } from "@/lib/shop";
import { formatDateLong, formatTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "You're booked",
  robots: { index: false, follow: false },
};

/**
 * The post-booking celebration screen, reached once with a fresh reference.
 *
 * It deliberately doesn't call `notFound()`. Next streams this route's shell
 * before the `searchParams` lookup resolves, so the HTTP status is already
 * committed — `notFound()` would render the 404 body under a 200, and
 * `force-dynamic` doesn't change that. Redirecting is honest either way: a
 * visitor with no reference hasn't booked anything and belongs on /book, and an
 * unknown reference belongs on /booking/[reference], the canonical lookup route
 * which *is* a real dynamic segment and 404s properly.
 */
export default async function ConfirmationPage(
  props: PageProps<"/book/confirmation">,
) {
  const searchParams = await props.searchParams;
  const reference = Array.isArray(searchParams.ref)
    ? searchParams.ref[0]
    : searchParams.ref;

  // Someone who landed here without a reference hasn't booked anything.
  if (!reference) redirect("/book");

  const [booking, currency] = await Promise.all([
    getBookingByReference(reference),
    getCurrency(),
  ]);
  if (!booking) redirect(`/booking/${encodeURIComponent(reference)}`);

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-14 sm:px-8 sm:py-20">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-400">
          <Check className="size-7 text-ink-950" strokeWidth={3} aria-hidden />
        </span>
        <h1 className="mt-6 font-display text-4xl font-bold uppercase leading-none tracking-tight text-ink-50 sm:text-5xl">
          You&rsquo;re booked
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-300">
          See you at {formatTime(booking.startsAt)} on{" "}
          {formatDateLong(booking.startsAt)}.
        </p>
      </div>

      <CopyReference code={booking.referenceCode} />

      <div className="mt-8">
        <BookingCard booking={booking} currency={currency} />
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button
          asChild
          variant="outline"
          className="h-12 flex-1 border-white/20 bg-white/5 hover:bg-white/10"
        >
          <Link href={`/booking/${booking.referenceCode}`}>
            <CalendarPlus className="size-4" />
            Manage booking
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="h-12 flex-1 border-white/20 bg-white/5 hover:bg-white/10"
        >
          <a href={`tel:${SHOP.phone.replace(/\s/g, "")}`}>
            <Phone className="size-4" />
            Call the shop
          </a>
        </Button>
      </div>

      <p className="mt-8 text-center text-sm leading-relaxed text-ink-500">
        Need to change or cancel? Use the manage link above, or give us a ring —
        just try to let us know before the day.
      </p>

      <div className="mt-10 text-center">
        <Link
          href="/"
          className="text-sm font-medium text-brand-400 underline-offset-4 hover:underline"
        >
          Back to {SHOP.name}
        </Link>
      </div>
    </div>
  );
}
