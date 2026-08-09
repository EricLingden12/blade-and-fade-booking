import Image from "next/image";
import { CalendarCheck, Sparkles, Timer } from "lucide-react";

const PROMISES = [
  {
    icon: CalendarCheck,
    title: "Booked means booked",
    body: "Your slot is held the second you confirm. No double-bookings, no 'sorry, someone just walked in'.",
  },
  {
    icon: Timer,
    title: "We run on time",
    body: "Ten minutes of turnover is built into every appointment, so a full book never turns into a waiting room.",
  },
  {
    icon: Sparkles,
    title: "One price, no upsell",
    body: "What you see on the menu is what you pay. Hot towel and beard oil come with the chair, not the bill.",
  },
];

export function AboutSection() {
  return (
    <section className="border-t border-white/10 bg-ink-950 py-20 sm:py-28">
      <div className="mx-auto grid w-full max-w-6xl gap-14 px-5 sm:px-8 lg:grid-cols-2 lg:items-center lg:gap-20">
        <div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-ink-900 lg:aspect-square">
          <Image
            src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=1200&q=80"
            alt="A barber finishing a straight-razor line-up"
            fill
            sizes="(min-width: 1024px) 40rem, 90vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/50 to-transparent" />
        </div>

        <div>
          <p className="eyebrow">Since 2016</p>
          <h2 className="mt-3 font-display text-4xl font-bold uppercase leading-none tracking-tight text-ink-50 sm:text-5xl">
            A proper barbershop,
            <br />
            <span className="text-brand-400">minus the queue</span>
          </h2>
          <p className="mt-6 text-base leading-relaxed text-ink-300">
            We opened on Al Fahidi Street with three chairs and one rule: never
            make a man wait for a haircut he already planned for. Everything
            else — the razors, the towels, the coffee — follows from that.
          </p>

          <ul className="mt-10 space-y-7">
            {PROMISES.map((promise) => (
              <li key={promise.title} className="flex gap-4">
                <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-400/10 ring-1 ring-brand-400/25">
                  <promise.icon className="size-5 text-brand-400" aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold text-ink-50">{promise.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-400">
                    {promise.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
