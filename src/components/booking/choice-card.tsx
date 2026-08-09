"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A large, thumb-friendly selectable card — the wizard's main control.
 *
 * Rendered as a real radio input rather than a styled `div` so keyboard arrow
 * navigation, screen-reader grouping and form semantics all come for free.
 */
export function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  title,
  subtitle,
  meta,
  media,
  className,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: (value: string) => void;
  title: string;
  subtitle?: string | null;
  meta?: React.ReactNode;
  media?: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "group relative flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-colors sm:p-5",
        checked
          ? "border-brand-400 bg-brand-400/8"
          : "border-white/12 bg-ink-900 hover:border-white/25 hover:bg-ink-800",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-400",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />

      {media}

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className="font-display text-lg font-semibold uppercase tracking-wide text-ink-50">
            {title}
          </span>
          {meta}
        </span>
        {subtitle && (
          <span className="mt-1.5 block text-sm leading-relaxed text-ink-400">
            {subtitle}
          </span>
        )}
      </span>

      <span
        aria-hidden
        className={cn(
          "absolute right-3 top-3 flex size-5 items-center justify-center rounded-full transition-opacity sm:static sm:mt-1",
          checked ? "bg-brand-400 opacity-100" : "opacity-0",
        )}
      >
        <Check className="size-3 text-ink-950" strokeWidth={3} />
      </span>
    </label>
  );
}
