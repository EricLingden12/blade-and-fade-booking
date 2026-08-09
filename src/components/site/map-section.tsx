import { ArrowUpRight, CalendarOff, MapPin, Navigation, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  appleMapsUrl,
  directionsUrl,
  formatAddress,
  hasPin,
  mapEmbedUrl,
} from "@/lib/location";
import { getClosuresWithin } from "@/lib/queries/hours";
import { getShopLocation } from "@/lib/queries/settings";
import { SHOP } from "@/lib/shop";
import { asShopWallClockDate, type DayKey } from "@/lib/time";

/** `25 Dec` for a single day, `25–27 Dec` for a run of them. */
function describeClosure(startsOn: string, endsOn: string): string {
  const format = (day: string, withMonth: boolean) =>
    asShopWallClockDate(day as DayKey).toLocaleDateString("en-GB", {
      day: "numeric",
      ...(withMonth ? { month: "short" } : {}),
    });

  if (startsOn === endsOn) return format(startsOn, true);

  const sameMonth = startsOn.slice(0, 7) === endsOn.slice(0, 7);
  return `${format(startsOn, !sameMonth)}–${format(endsOn, true)}`;
}

/**
 * "Where we are" — the map, the address and two ways to get walking directions.
 *
 * The section renders even without a pin so the `#visit` anchor in the header
 * never dead-ends; only the map itself is conditional.
 */
export async function MapSection() {
  const [location, closures] = await Promise.all([
    getShopLocation(),
    // Far enough ahead to be useful, near enough that it isn't a wall of dates.
    getClosuresWithin(90),
  ]);
  const pinned = hasPin(location);

  return (
    <section
      id="visit"
      className="border-t border-white/10 bg-ink-900/40 py-20 sm:py-28"
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="eyebrow">Find us</p>
          <h2 className="mt-3 font-display text-4xl font-bold uppercase leading-none tracking-tight text-ink-50 sm:text-5xl">
            Come and <span className="text-brand-400">sit down</span>
          </h2>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-5 lg:gap-10">
          {pinned && (
            <div className="relative overflow-hidden rounded-2xl border border-white/10 lg:col-span-3">
              {/*
                OpenStreetMap only ships a light tile set. Inverting and
                rotating the hue back round lands it close to the charcoal
                palette, which beats a bright white rectangle in the middle of
                a dark page. Purely cosmetic — the map still works if a browser
                ignores the filter.
              */}
              <iframe
                title={`Map showing ${SHOP.fullName} at ${formatAddress(location)}`}
                src={mapEmbedUrl(location)}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="aspect-4/3 w-full border-0 [filter:invert(0.92)_hue-rotate(180deg)_saturate(0.75)_brightness(0.95)] sm:aspect-video lg:aspect-4/3"
              />
              <div
                className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10"
                aria-hidden
              />
            </div>
          )}

          <div className={pinned ? "lg:col-span-2" : "lg:col-span-3"}>
            <div className="rounded-2xl border border-white/10 bg-ink-950/60 p-7 sm:p-8">
              <h3 className="flex items-center gap-2.5 font-display text-sm font-semibold uppercase tracking-[0.18em] text-ink-50">
                <MapPin className="size-4 text-brand-400" aria-hidden />
                {SHOP.name}
              </h3>

              <address className="mt-4 space-y-1 text-base not-italic leading-relaxed text-ink-200">
                {location.addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>

              {location.directionsNote && (
                <p className="mt-4 rounded-lg border border-brand-400/20 bg-brand-400/5 px-4 py-3 text-sm leading-relaxed text-ink-300">
                  {location.directionsNote}
                </p>
              )}

              {closures.length > 0 && (
                <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                  <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-300">
                    <CalendarOff className="size-3.5 text-brand-400" aria-hidden />
                    Closed
                  </h4>
                  <ul className="mt-2 space-y-1 text-sm text-ink-400">
                    {closures.map((closure) => (
                      <li key={closure.id}>
                        <span className="text-ink-200">
                          {describeClosure(closure.starts_on, closure.ends_on)}
                        </span>
                        {closure.reason && ` · ${closure.reason}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-7 flex flex-col gap-3">
                <Button
                  asChild
                  className="h-12 bg-brand-400 font-semibold text-ink-950 hover:bg-brand-300"
                >
                  <a
                    href={directionsUrl(location)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation className="size-4" />
                    Get directions
                    <ArrowUpRight className="size-4" />
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-12 border-white/20 bg-white/5 hover:bg-white/10"
                >
                  <a href={`tel:${SHOP.phone.replace(/\s/g, "")}`}>
                    <Phone className="size-4" />
                    {SHOP.phone}
                  </a>
                </Button>
              </div>

              {/* iOS users get a native app; everyone else already has the
                  Google link above and doesn't need a second one. */}
              <p className="mt-5 text-center text-xs text-ink-500">
                On an iPhone?{" "}
                <a
                  href={appleMapsUrl(location)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-400 underline-offset-4 hover:underline"
                >
                  Open in Apple Maps
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
