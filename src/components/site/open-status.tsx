import { Clock } from "lucide-react";

import type { ShopClosure, ShopHours } from "@/lib/database.types";
import { getShopHours, getUpcomingClosures } from "@/lib/queries/hours";
import { closureFor } from "@/lib/slots";
import { DAY_NAMES, formatWallTime } from "@/lib/shop";
import {
  dayOfWeek,
  formatInShop,
  shiftDayKey,
  todayInShop,
  wallTimeToMinutes,
  type DayKey,
} from "@/lib/time";

/**
 * "Open until 9 PM" / "Opens 10 AM" / "Closed today", derived from the shop's
 * opening hours and the current time *in Dubai* — not the visitor's clock. A
 * customer in London must still see the shop's status, not their own.
 *
 * A calendar closure beats the weekly hours, so a public holiday reads as
 * closed even on a day the shop normally opens.
 */
export async function OpenStatus({ className }: { className?: string }) {
  const [hours, closures] = await Promise.all([
    getShopHours(),
    getUpcomingClosures(),
  ]);

  const today = todayInShop();
  const nowMinutes = wallTimeToMinutes(formatInShop(new Date(), "HH:mm"));

  const closedToday = closureFor(today, closures);
  const todaysHours = hours.find((row) => row.day_of_week === dayOfWeek(today));

  let label: string;
  if (closedToday) {
    label = closedToday.reason
      ? `Closed today · ${closedToday.reason}`
      : "Closed today";
  } else if (!todaysHours?.is_open) {
    label = "Closed today";
  } else if (nowMinutes < wallTimeToMinutes(todaysHours.opens)) {
    label = `Opens ${formatWallTime(todaysHours.opens)} today`;
  } else if (nowMinutes < wallTimeToMinutes(todaysHours.closes)) {
    label = `Open until ${formatWallTime(todaysHours.closes)}`;
  } else {
    label = nextOpeningLabel(hours, closures, today);
  }

  return (
    <div className={className}>
      <Clock className="size-4 shrink-0 text-brand-400" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

/**
 * "Closed · opens 10 AM tomorrow", skipping days the shop is shut.
 *
 * Looks a week ahead and then gives up: a shop with no open days at all would
 * otherwise loop forever.
 */
function nextOpeningLabel(
  hours: ShopHours[],
  closures: ShopClosure[],
  today: DayKey,
): string {
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const day = shiftDayKey(today, ahead);
    if (closureFor(day, closures)) continue;

    const match = hours.find((row) => row.day_of_week === dayOfWeek(day));
    if (!match?.is_open) continue;

    const when = ahead === 1 ? "tomorrow" : DAY_NAMES[dayOfWeek(day)];
    return `Closed · opens ${formatWallTime(match.opens)} ${when}`;
  }
  return "Closed";
}
