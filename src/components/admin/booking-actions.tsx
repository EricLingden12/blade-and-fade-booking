"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Ban, Check, CircleCheck, Loader2, UserX } from "lucide-react";
import { toast } from "sonner";

import { updateBookingStatusAction } from "@/app/admin/(dashboard)/bookings/actions";
import { Button } from "@/components/ui/button";
import type { BookingStatus } from "@/lib/database.types";

const ACTIONS: Array<{
  status: BookingStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Statuses this action makes sense from. */
  from: BookingStatus[];
  variant?: "default" | "outline" | "destructive";
}> = [
  {
    status: "confirmed",
    label: "Confirm",
    icon: Check,
    from: ["pending", "cancelled"],
  },
  {
    status: "completed",
    label: "Mark completed",
    icon: CircleCheck,
    from: ["pending", "confirmed"],
    variant: "outline",
  },
  {
    status: "no_show",
    label: "No-show",
    icon: UserX,
    from: ["pending", "confirmed", "completed"],
    variant: "outline",
  },
  {
    status: "cancelled",
    label: "Cancel",
    icon: Ban,
    from: ["pending", "confirmed"],
    variant: "destructive",
  },
];

export function BookingActions({
  id,
  status,
}: {
  id: string;
  status: BookingStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const available = ACTIONS.filter((action) => action.from.includes(status));
  if (available.length === 0) return null;

  function apply(next: BookingStatus) {
    startTransition(async () => {
      const result = await updateBookingStatusAction({ id, status: next });
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {available.map((action) => (
        <Button
          key={action.status}
          size="sm"
          variant={action.variant ?? "default"}
          disabled={pending}
          onClick={() => apply(action.status)}
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <action.icon className="size-3.5" />
          )}
          {action.label}
        </Button>
      ))}
    </div>
  );
}
