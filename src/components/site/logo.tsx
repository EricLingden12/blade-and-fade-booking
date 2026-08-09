import Link from "next/link";

import { cn } from "@/lib/utils";

/** Wordmark + barber-pole glyph. Used in the header, footer and admin sidebar. */
export function Logo({
  className,
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-400",
        className,
      )}
      aria-label="Blade & Fade Barbershop — home"
    >
      <span
        aria-hidden
        className="relative h-7 w-2.5 overflow-hidden rounded-full ring-1 ring-white/25"
      >
        <span className="absolute inset-0 bg-[repeating-linear-gradient(135deg,var(--color-barber-500)_0_4px,var(--color-ink-50)_4px_8px,var(--color-ink-800)_8px_12px,var(--color-ink-50)_12px_16px)]" />
      </span>
      <span className="font-display text-lg font-semibold uppercase leading-none tracking-[0.14em]">
        Blade<span className="text-brand-400">&</span>Fade
      </span>
    </Link>
  );
}
