import type { BookingStatus } from "@/lib/database.types";
import { cn } from "@/lib/utils";

export const STATUS_META: Record<
  BookingStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "Pending",
    className: "bg-amber-100 text-amber-900 ring-amber-600/20",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-emerald-100 text-emerald-900 ring-emerald-600/20",
  },
  completed: {
    label: "Completed",
    className: "bg-sky-100 text-sky-900 ring-sky-600/20",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
  },
  no_show: {
    label: "No-show",
    className: "bg-rose-100 text-rose-900 ring-rose-600/20",
  },
};

export const STATUS_ORDER: BookingStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
];

export function StatusBadge({
  status,
  className,
}: {
  status: BookingStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
