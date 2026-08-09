import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export const STEP_LABELS = [
  "Service",
  "Barber",
  "Date & time",
  "Your details",
  "Confirm",
] as const;

export function StepIndicator({ current }: { current: number }) {
  return (
    <nav aria-label="Booking progress">
      {/* Compact on phones — five labelled dots don't fit, so show position. */}
      <p className="text-sm font-medium text-ink-400 sm:hidden">
        Step {current + 1} of {STEP_LABELS.length}
        <span className="ml-2 text-ink-100">{STEP_LABELS[current]}</span>
      </p>

      <ol className="hidden items-center gap-2 sm:flex">
        {STEP_LABELS.map((label, index) => {
          const done = index < current;
          const active = index === current;

          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  done && "bg-brand-400 text-ink-950",
                  active && "bg-ink-50 text-ink-950",
                  !done && !active && "bg-white/10 text-ink-400",
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "text-sm transition-colors",
                  active ? "font-medium text-ink-50" : "text-ink-500",
                )}
              >
                {label}
                {active && <span className="sr-only"> (current step)</span>}
              </span>
              {index < STEP_LABELS.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "ml-1 h-px w-6 lg:w-10",
                    done ? "bg-brand-400/50" : "bg-white/15",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
