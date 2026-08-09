import { Clock } from "lucide-react";

import { formatWallTime, hoursForDay } from "@/lib/shop";
import {
  dayOfWeek,
  formatInShop,
  todayInShop,
  wallTimeToMinutes,
} from "@/lib/time";

/**
 * "Open until 9 PM" / "Opens 10 AM" / "Closed today", derived from the
 * advertised hours and the current time *in Dubai* — not the visitor's clock.
 * A customer in London must still see the shop's status, not their own.
 */
export function OpenStatus({ className }: { className?: string }) {
  const today = todayInShop();
  const hours = hoursForDay(dayOfWeek(today));
  const nowMinutes = wallTimeToMinutes(formatInShop(new Date(), "HH:mm"));

  let label: string;
  if (!hours) {
    label = "Closed today";
  } else if (nowMinutes < wallTimeToMinutes(hours.opens)) {
    label = `Opens ${formatWallTime(hours.opens)} today`;
  } else if (nowMinutes < wallTimeToMinutes(hours.closes)) {
    label = `Open until ${formatWallTime(hours.closes)}`;
  } else {
    const tomorrow = hoursForDay((dayOfWeek(today) + 1) % 7);
    label = tomorrow
      ? `Closed · opens ${formatWallTime(tomorrow.opens)} tomorrow`
      : "Closed";
  }

  return (
    <div className={className}>
      <Clock className="size-4 shrink-0 text-brand-400" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
