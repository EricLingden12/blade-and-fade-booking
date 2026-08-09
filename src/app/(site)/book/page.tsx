import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX2 } from "lucide-react";

import { BookingWizard } from "@/components/booking/booking-wizard";
import { Button } from "@/components/ui/button";
import {
  getActiveServices,
  getActiveStaff,
  getServiceStaffMap,
} from "@/lib/queries/public";
import { getCurrency } from "@/lib/queries/settings";
import { SHOP } from "@/lib/shop";

export const metadata: Metadata = {
  title: "Book an appointment",
  description:
    "Pick your service, your barber and your time. Takes about a minute, no account needed.",
};

export default async function BookPage(props: PageProps<"/book">) {
  const [searchParams, services, staff, serviceStaff, currency] = await Promise.all([
    props.searchParams,
    getActiveServices(),
    getActiveStaff(),
    getServiceStaffMap(),
    getCurrency(),
  ]);

  if (services.length === 0 || staff.length === 0) {
    return <BookingUnavailable />;
  }

  // Deep links from the home page: /book?service=… or /book?staff=…
  // Anything that doesn't match a real, active row is ignored rather than
  // erroring — a stale link should still land the customer in the flow.
  const requestedService = firstParam(searchParams.service);
  const requestedStaff = firstParam(searchParams.staff);

  const initialServiceId =
    services.find((item) => item.id === requestedService)?.id ?? null;
  const initialStaffId =
    staff.find((item) => item.id === requestedStaff)?.id ?? null;

  return (
    <BookingWizard
      services={services}
      staff={staff}
      serviceStaff={serviceStaff}
      currency={currency}
      initialServiceId={initialServiceId}
      // Only honour a pinned barber if they actually offer the pinned service.
      initialStaffId={
        initialStaffId &&
        (!initialServiceId ||
          (serviceStaff[initialServiceId] ?? []).includes(initialStaffId))
          ? initialStaffId
          : null
      }
    />
  );
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function BookingUnavailable() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-5 py-28 text-center sm:py-36">
      <CalendarX2 className="size-9 text-ink-600" aria-hidden />
      <h1 className="mt-5 font-display text-3xl font-bold uppercase tracking-tight text-ink-50">
        Online booking is paused
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-400">
        We&rsquo;re updating the books. Give the shop a ring and we&rsquo;ll get
        you in the old-fashioned way.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button
          asChild
          className="bg-brand-400 font-semibold text-ink-950 hover:bg-brand-300"
        >
          <a href={`tel:${SHOP.phone.replace(/\s/g, "")}`}>Call {SHOP.phone}</a>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-white/20 bg-white/5 hover:bg-white/10"
        >
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}
