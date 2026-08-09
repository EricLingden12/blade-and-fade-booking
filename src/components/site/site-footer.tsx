import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";

import { InstagramIcon } from "@/components/site/instagram-icon";
import { Logo } from "@/components/site/logo";
import { directionsUrl } from "@/lib/location";
import { getShopHours } from "@/lib/queries/hours";
import { getShopLocation } from "@/lib/queries/settings";
import { DAY_NAMES, formatWallTime, SHOP } from "@/lib/shop";
import { dayOfWeek, todayInShop } from "@/lib/time";
import { cn } from "@/lib/utils";

export async function SiteFooter() {
  // Highlight the current day in *shop* time, not the visitor's.
  const todayIndex = dayOfWeek(todayInShop());
  const [location, shopHours] = await Promise.all([
    getShopLocation(),
    getShopHours(),
  ]);

  return (
    <footer className="border-t border-white/10 bg-ink-950 text-ink-300">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-3 md:gap-8">
        <div className="space-y-4">
          <Logo className="text-ink-50" />
          <p className="max-w-xs text-sm leading-relaxed text-ink-400">
            {SHOP.tagline} Walk-ins welcome when a chair is free — booking ahead
            guarantees it.
          </p>
          <Link
            href={SHOP.instagram}
            className="inline-flex items-center gap-2 text-sm text-ink-300 transition-colors hover:text-brand-400"
            target="_blank"
            rel="noreferrer"
          >
            <InstagramIcon className="size-4" />
            @bladeandfade
          </Link>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-ink-50">
            Find us
          </h2>
          <address className="space-y-3 text-sm not-italic">
            <a
              href={directionsUrl(location)}
              target="_blank"
              rel="noreferrer"
              className="flex items-start gap-2.5 transition-colors hover:text-brand-400"
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand-400" />
              <span>
                {location.addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </span>
            </a>
            <a
              href={`tel:${SHOP.phone.replace(/\s/g, "")}`}
              className="flex items-center gap-2.5 transition-colors hover:text-brand-400"
            >
              <Phone className="size-4 shrink-0 text-brand-400" />
              {SHOP.phone}
            </a>
            <a
              href={`mailto:${SHOP.email}`}
              className="flex items-center gap-2.5 transition-colors hover:text-brand-400"
            >
              <Mail className="size-4 shrink-0 text-brand-400" />
              {SHOP.email}
            </a>
          </address>
        </div>

        <div className="space-y-4">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-ink-50">
            Opening hours
          </h2>
          <dl className="space-y-2 text-sm">
            {shopHours.map((hours) => (
              <div
                key={hours.day_of_week}
                className={cn(
                  "flex justify-between gap-4",
                  hours.day_of_week === todayIndex &&
                    "font-medium text-brand-400",
                )}
              >
                <dt
                  className={
                    hours.day_of_week === todayIndex ? "" : "text-ink-400"
                  }
                >
                  {DAY_NAMES[hours.day_of_week]}
                  {hours.day_of_week === todayIndex && (
                    <span className="sr-only"> (today)</span>
                  )}
                </dt>
                <dd
                  className={cn(
                    "tabular-nums",
                    hours.day_of_week === todayIndex ? "" : "text-ink-200",
                  )}
                >
                  {hours.is_open
                    ? `${formatWallTime(hours.opens)} – ${formatWallTime(hours.closes)}`
                    : "Closed"}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-ink-500">All times Gulf Standard (GST).</p>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>
            © {new Date().getFullYear()} {SHOP.fullName}. All rights reserved.
          </p>
          <Link
            href="/admin"
            className="transition-colors hover:text-ink-300"
            prefetch={false}
          >
            Staff login
          </Link>
        </div>
      </div>
    </footer>
  );
}
