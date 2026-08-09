import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";

import { OpenStatus } from "@/components/site/open-status";
import { Button } from "@/components/ui/button";
import { formatAddress } from "@/lib/location";
import { getShopLocation } from "@/lib/queries/settings";

export async function Hero() {
  const location = await getShopLocation();

  return (
    <section className="relative isolate overflow-hidden">
      <Image
        src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=2000&q=80"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover"
      />
      {/* Two stacked scrims: a vertical one to seat the type, and a warm side
          wash so the amber accent doesn't fight the photo's own lighting. */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink-950/85 via-ink-950/70 to-ink-950" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink-950/90 via-ink-950/40 to-transparent" />

      <div className="mx-auto w-full max-w-6xl px-5 pb-20 pt-24 sm:px-8 sm:pb-28 sm:pt-32 lg:pb-36 lg:pt-40">
        <p className="eyebrow">Bur Dubai · Est. 2016</p>

        <h1 className="mt-5 max-w-3xl font-display text-5xl font-bold uppercase leading-[0.92] tracking-tight text-ink-50 sm:text-7xl lg:text-8xl">
          Sharp cuts.
          <br />
          <span className="text-brand-400">No waiting.</span>
        </h1>

        <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-200 sm:text-xl">
          Three chairs, three specialists, and a booking flow that takes under a
          minute. Pick your barber, pick your time, done — no account, no phone
          calls.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            asChild
            size="lg"
            className="h-13 bg-brand-400 px-8 text-base font-semibold text-ink-950 shadow-lg shadow-brand-400/20 transition-transform hover:bg-brand-300 active:scale-[0.98]"
          >
            <Link href="/book">
              Book a chair
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-13 border-white/25 bg-white/5 px-8 text-base font-medium text-ink-100 backdrop-blur-sm hover:bg-white/10 hover:text-white"
          >
            <Link href="#services">See the menu</Link>
          </Button>
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-x-8 gap-y-4 text-sm text-ink-300">
          <OpenStatus className="flex items-center gap-2.5" />
          <p className="flex items-center gap-2.5">
            <MapPin className="size-4 shrink-0 text-brand-400" aria-hidden />
            {formatAddress(location)}
          </p>
        </div>
      </div>
    </section>
  );
}
