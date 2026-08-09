"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarOff, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  addClosureAction,
  deleteClosureAction,
} from "@/app/admin/(dashboard)/schedule/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ShopClosure } from "@/lib/database.types";
import { asShopWallClockDate, todayInShop, type DayKey } from "@/lib/time";

/** `2026-12-25` -> `Fri 25 Dec 2026`, without touching the visitor's clock. */
function formatDayKey(day: string): string {
  return asShopWallClockDate(day as DayKey).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function describeRange(closure: ShopClosure): string {
  return closure.starts_on === closure.ends_on
    ? formatDayKey(closure.starts_on)
    : `${formatDayKey(closure.starts_on)} → ${formatDayKey(closure.ends_on)}`;
}

function countDays(startsOn: string, endsOn: string): number {
  const start = asShopWallClockDate(startsOn as DayKey).getTime();
  const end = asShopWallClockDate(endsOn as DayKey).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

export function ClosuresList({ closures }: { closures: ShopClosure[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteClosureAction(id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {closures.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
          <CalendarOff className="size-6 text-muted-foreground/60" aria-hidden />
          <p className="text-sm font-medium">No closures planned</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            The shop is bookable on every day its opening hours allow.
          </p>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border">
          {closures.map((closure) => {
            const days = countDays(closure.starts_on, closure.ends_on);
            return (
              <li
                key={closure.id}
                className="flex items-center gap-4 px-4 py-3"
              >
                <CalendarOff
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {describeRange(closure)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {days} {days === 1 ? "day" : "days"}
                    {closure.reason ? ` · ${closure.reason}` : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(closure.id)}
                  disabled={pending}
                  aria-label={`Remove closure ${describeRange(closure)}`}
                >
                  <X className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Button variant="outline" onClick={() => setAdding(true)}>
        <Plus className="size-4" />
        Close the shop for a day
      </Button>

      <AddClosureDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}

function AddClosureDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const today = todayInShop();

  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  const [reason, setReason] = useState("");

  const backwards = endsOn < startsOn;

  function submit() {
    startTransition(async () => {
      const result = await addClosureAction({ startsOn, endsOn, reason });
      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
        setStartsOn(today);
        setEndsOn(today);
        setReason("");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Close the shop</DialogTitle>
          <DialogDescription>
            Nobody can book these days — every barber at once. For one person
            being away, use time off instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="closure-start">First day closed</Label>
              <Input
                id="closure-start"
                type="date"
                value={startsOn}
                min={today}
                onChange={(event) => {
                  setStartsOn(event.target.value);
                  // Keep the range sane while they're still typing.
                  if (endsOn < event.target.value) setEndsOn(event.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closure-end">Last day closed</Label>
              <Input
                id="closure-end"
                type="date"
                value={endsOn}
                min={startsOn}
                aria-invalid={backwards}
                onChange={(event) => setEndsOn(event.target.value)}
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {backwards
              ? "The last day can't be before the first day."
              : `${countDays(startsOn, endsOn)} ${
                  countDays(startsOn, endsOn) === 1 ? "day" : "days"
                } closed, including both dates.`}
          </p>

          <div className="space-y-2">
            <Label htmlFor="closure-reason">
              Reason{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="closure-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Eid al-Fitr"
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground">
              Shown on the website so customers know why.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || backwards}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Close the shop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
