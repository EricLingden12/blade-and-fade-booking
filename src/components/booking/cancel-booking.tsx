"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cancelBookingAction } from "@/app/(site)/book/actions";
import { Button } from "@/components/ui/button";

/**
 * Two-tap cancel. A confirm step inline rather than a dialog, because the
 * public surface is dark and shadcn dialogs portal outside that subtree.
 */
export function CancelBooking({ reference }: { reference: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const result = await cancelBookingAction(reference);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
      setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button
        variant="outline"
        onClick={() => setConfirming(true)}
        className="border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:text-red-200"
      >
        Cancel booking
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm font-medium text-ink-100" role="status">
        Cancel this appointment?
      </p>
      <Button
        onClick={cancel}
        disabled={pending}
        className="bg-red-500 font-semibold text-white hover:bg-red-600"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Cancelling…
          </>
        ) : (
          "Yes, cancel it"
        )}
      </Button>
      <Button
        variant="ghost"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="text-ink-300 hover:bg-white/5 hover:text-ink-50"
      >
        Keep it
      </Button>
    </div>
  );
}
