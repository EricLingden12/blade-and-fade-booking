import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";

import type { Staff } from "@/lib/database.types";

export function BarbersSection({ staff }: { staff: Staff[] }) {
  return (
    <section
      id="barbers"
      className="scroll-mt-16 border-t border-white/10 bg-ink-900 py-20 sm:py-28"
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <p className="eyebrow">The chairs</p>
        <h2 className="mt-3 max-w-2xl font-display text-4xl font-bold uppercase leading-none tracking-tight text-ink-50 sm:text-5xl">
          Meet the barbers
        </h2>
        <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-400">
          Book whoever you like the look of — or leave it to us and we&rsquo;ll
          put you with whoever&rsquo;s free soonest.
        </p>

        {staff.length === 0 ? (
          <div className="mt-12 flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/15 px-6 py-16 text-center">
            <Users className="size-7 text-ink-600" aria-hidden />
            <p className="font-medium text-ink-200">
              Our team page is being updated
            </p>
          </div>
        ) : (
          <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {staff.map((barber) => (
              <li key={barber.id} className="group">
                <Link
                  href={`/book?staff=${barber.id}`}
                  className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-400"
                >
                  <div className="relative aspect-4/5 overflow-hidden rounded-xl bg-ink-800">
                    {barber.avatar_url ? (
                      <Image
                        src={barber.avatar_url}
                        alt={`${barber.name}, barber at Blade & Fade`}
                        fill
                        sizes="(min-width: 1024px) 20rem, (min-width: 640px) 45vw, 90vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <span className="font-display text-5xl font-bold text-ink-700">
                          {initials(barber.name)}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-ink-950/90 to-transparent" />
                    <h3 className="absolute inset-x-0 bottom-0 p-5 font-display text-2xl font-semibold uppercase tracking-wide text-ink-50">
                      {barber.name}
                    </h3>
                  </div>

                  {barber.bio && (
                    <p className="mt-4 text-sm leading-relaxed text-ink-400">
                      {barber.bio}
                    </p>
                  )}

                  <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-400">
                    Book with {barber.name.split(" ")[0]}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
