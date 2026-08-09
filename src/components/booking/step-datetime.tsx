"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarX2, Loader2, RefreshCw } from "lucide-react";

import {
  fetchCalendarAction,
  fetchSlotsAction,
} from "@/app/(site)/book/actions";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  asShopWallClockDate,
  dayKeyFromLocalDate,
  formatDateLong,
  formatTime,
  shiftDayKey,
  todayInShop,
  type DayKey,
} from "@/lib/time";
import { cn } from "@/lib/utils";

type Slot = { startsAt: string; endsAt: string };

type CalendarData = {
  minDay: DayKey;
  maxDay: DayKey;
  closedDays: Set<DayKey>;
};

/**
 * Both fetches key their result to the selection that produced it, and the
 * render derives "is this still current?" by comparing keys. Clearing state in
 * an effect the moment the selection changes would work too, but it costs an
 * extra render pass and leaves a frame where stale times are still on screen —
 * which on this step means showing slots for the wrong barber.
 */
export function StepDateTime({
  serviceId,
  staffId,
  day,
  startsAt,
  onChange,
}: {
  serviceId: string;
  staffId: string | null;
  day: DayKey | null;
  startsAt: string | null;
  onChange: (next: { day: DayKey | null; startsAt: string | null }) => void;
}) {
  const selectionKey = `${serviceId}:${staffId ?? "any"}`;
  const slotKey = day ? `${selectionKey}:${day}` : null;

  const [calendarState, setCalendarState] = useState<{
    key: string;
    data: CalendarData;
  } | null>(null);

  const [slotState, setSlotState] = useState<{
    key: string;
    slots: Slot[];
    error: string | null;
  } | null>(null);

  const [retryToken, setRetryToken] = useState(0);
  const [loadingSlots, startLoadingSlots] = useTransition();

  const calendar =
    calendarState?.key === selectionKey ? calendarState.data : null;
  const current = slotKey && slotState?.key === slotKey ? slotState : null;
  const slots = current?.slots ?? null;
  const slotError = current?.error ?? null;

  // Which days to grey out. Refetched when the service or barber changes,
  // because a different barber keeps a different week.
  useEffect(() => {
    let cancelled = false;

    fetchCalendarAction({ serviceId, staffId }).then((result) => {
      if (cancelled) return;
      setCalendarState({
        key: selectionKey,
        data: {
          minDay: result.minDay,
          maxDay: result.maxDay,
          closedDays: new Set(result.closedDays),
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [selectionKey, serviceId, staffId]);

  useEffect(() => {
    if (!day || !slotKey) return;
    let cancelled = false;

    startLoadingSlots(async () => {
      const result = await fetchSlotsAction({ serviceId, staffId, day });
      if (cancelled) return;

      setSlotState(
        result.ok
          ? { key: slotKey, slots: result.slots, error: null }
          : { key: slotKey, slots: [], error: result.message },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [slotKey, day, serviceId, staffId, retryToken]);

  const today = todayInShop();

  const disabledMatcher = calendar
    ? (date: Date) => {
        const key = dayKeyFromLocalDate(date);
        return (
          key < calendar.minDay ||
          key > calendar.maxDay ||
          calendar.closedDays.has(key)
        );
      }
    : undefined;

  return (
    <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:gap-10">
      <div>
        <h2 className="sr-only">Choose a date</h2>
        {calendar ? (
          <Calendar
            mode="single"
            required={false}
            selected={day ? asShopWallClockDate(`${day}T12:00:00Z`) : undefined}
            onSelect={(date) => {
              if (!date) return;
              onChange({ day: dayKeyFromLocalDate(date), startsAt: null });
            }}
            disabled={disabledMatcher}
            startMonth={asShopWallClockDate(`${today}T12:00:00Z`)}
            endMonth={asShopWallClockDate(`${calendar.maxDay}T12:00:00Z`)}
            className="rounded-xl border border-white/12 bg-ink-900 p-3 [--cell-size:--spacing(10)]"
          />
        ) : (
          <Skeleton className="h-[22rem] w-full rounded-xl bg-white/5 lg:w-[19rem]" />
        )}
        <p className="mt-3 max-w-[19rem] text-xs leading-relaxed text-ink-500">
          Greyed-out days are closed or fully committed. All times are Dubai
          time (GST).
        </p>
      </div>

      <div className="min-w-0">
        {!day ? (
          <Placeholder
            title="Pick a date to see times"
            body="We'll show every chair that's free, updated the moment you choose."
          />
        ) : loadingSlots || slots === null ? (
          <SlotSkeleton day={day} />
        ) : slots.length === 0 ? (
          <NoSlots
            day={day}
            error={slotError}
            // A day can be empty for two very different reasons, and telling a
            // customer a closed Sunday is "fully booked" reads as a lie.
            closed={calendar?.closedDays.has(day) ?? false}
            onRetry={() => setRetryToken((token) => token + 1)}
            onNextDay={() =>
              onChange({ day: shiftDayKey(day, 1), startsAt: null })
            }
          />
        ) : (
          <>
            <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-ink-50">
              {formatDateLong(`${day}T12:00:00Z`)}
            </h2>
            <p className="mt-1 text-sm text-ink-400">
              {slots.length} {slots.length === 1 ? "time" : "times"} available
            </p>

            <fieldset className="mt-5">
              <legend className="sr-only">Available start times</legend>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
                {slots.map((slot) => {
                  const checked = startsAt === slot.startsAt;
                  return (
                    <label
                      key={slot.startsAt}
                      className={cn(
                        "relative flex cursor-pointer items-center justify-center rounded-lg border py-3 text-sm font-medium tabular-nums transition-colors",
                        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-400",
                        checked
                          ? "border-brand-400 bg-brand-400 text-ink-950"
                          : "border-white/12 bg-ink-900 text-ink-100 hover:border-white/30 hover:bg-ink-800",
                      )}
                    >
                      <input
                        type="radio"
                        name="slot"
                        value={slot.startsAt}
                        checked={checked}
                        onChange={() =>
                          onChange({ day, startsAt: slot.startsAt })
                        }
                        className="sr-only"
                      />
                      {formatTime(slot.startsAt)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </>
        )}
      </div>
    </div>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-white/12 px-6 py-12 text-center">
      <p className="font-medium text-ink-200">{title}</p>
      <p className="mt-1.5 max-w-xs text-sm text-ink-500">{body}</p>
    </div>
  );
}

function SlotSkeleton({ day }: { day: DayKey }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-ink-50">
        {formatDateLong(`${day}T12:00:00Z`)}
      </h2>
      <p className="mt-1 flex items-center gap-2 text-sm text-ink-400">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Checking the book…
      </p>
      <div className="mt-5 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, index) => (
          <Skeleton key={index} className="h-11 rounded-lg bg-white/5" />
        ))}
      </div>
    </div>
  );
}

function NoSlots({
  day,
  error,
  closed,
  onRetry,
  onNextDay,
}: {
  day: DayKey;
  error: string | null;
  closed: boolean;
  onRetry: () => void;
  onNextDay: () => void;
}) {
  const date = formatDateLong(`${day}T12:00:00Z`);

  const title = error
    ? "We couldn't load times"
    : closed
      ? "We're closed that day"
      : "Nothing left on this day";

  const body =
    error ??
    (closed
      ? `Nobody's in the shop on ${date}. Pick another day and we'll get you in.`
      : `${date} is fully booked. Try the next day — cancellations do come up.`);

  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-white/12 px-6 py-12 text-center">
      <CalendarX2 className="size-7 text-ink-600" aria-hidden />
      <p className="mt-3 font-medium text-ink-200">{title}</p>
      <p className="mt-1.5 max-w-xs text-sm text-ink-500">{body}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {error ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="border-white/20 bg-white/5 hover:bg-white/10"
          >
            <RefreshCw className="size-3.5" />
            Try again
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onNextDay}
            className="border-white/20 bg-white/5 hover:bg-white/10"
          >
            Try the next day
          </Button>
        )}
      </div>
    </div>
  );
}
