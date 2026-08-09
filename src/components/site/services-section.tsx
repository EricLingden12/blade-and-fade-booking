import Link from "next/link";
import { ArrowRight, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Service } from "@/lib/database.types";
import { formatMoney } from "@/lib/money";
import { formatDuration } from "@/lib/time";

export function ServicesSection({
  services,
  currency,
}: {
  services: Service[];
  currency: string;
}) {
  return (
    <section
      id="services"
      className="scroll-mt-16 border-t border-white/10 bg-ink-950 py-20 sm:py-28"
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">The menu</p>
            <h2 className="mt-3 font-display text-4xl font-bold uppercase leading-none tracking-tight text-ink-50 sm:text-5xl">
              What we do
            </h2>
          </div>
          <p className="max-w-sm text-sm leading-relaxed text-ink-400">
            Every price is the price — no upsell at the chair. Prices in{" "}
            {currency}, cash or card on the day.
          </p>
        </div>

        {services.length === 0 ? (
          <EmptyMenu />
        ) : (
          <ul className="mt-12 grid gap-px overflow-hidden rounded-xl bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <li key={service.id} className="group flex bg-ink-900">
                <Link
                  href={`/book?service=${service.id}`}
                  className="flex w-full flex-col gap-3 p-6 transition-colors hover:bg-ink-800 focus-visible:bg-ink-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-400 sm:p-7"
                >
                  <div className="flex items-start justify-between gap-4">
                    <h3 className="font-display text-xl font-semibold uppercase tracking-wide text-ink-50">
                      {service.name}
                    </h3>
                    <span className="shrink-0 font-display text-xl font-semibold tabular-nums text-brand-400">
                      {formatMoney(service.price, currency)}
                    </span>
                  </div>

                  {service.description && (
                    <p className="text-sm leading-relaxed text-ink-400">
                      {service.description}
                    </p>
                  )}

                  <p className="mt-auto flex items-center gap-2 pt-2 text-xs font-medium uppercase tracking-wider text-ink-500">
                    {formatDuration(service.duration_minutes)}
                    <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {services.length > 0 && (
          <div className="mt-10">
            <Button
              asChild
              size="lg"
              className="h-12 bg-brand-400 px-7 font-semibold text-ink-950 hover:bg-brand-300"
            >
              <Link href="/book">
                Book any service
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyMenu() {
  return (
    <div className="mt-12 flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/15 px-6 py-16 text-center">
      <Scissors className="size-7 text-ink-600" aria-hidden />
      <p className="font-medium text-ink-200">The menu is being updated</p>
      <p className="max-w-sm text-sm text-ink-500">
        Give us a moment, or call the shop and we&rsquo;ll book you in the
        old-fashioned way.
      </p>
    </div>
  );
}
