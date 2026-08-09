"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarOff, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  addShiftAction,
  addTimeOffAction,
  deleteShiftAction,
  deleteTimeOffAction,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Staff, TimeOff, WorkingHours } from "@/lib/database.types";
import { DAY_NAMES, formatWallTime } from "@/lib/shop";
import { formatDateTime, todayInShop } from "@/lib/time";

// ---------------------------------------------------------------------------
// Weekly hours
// ---------------------------------------------------------------------------

export function WeeklyHours({
  staff,
  hours,
}: {
  staff: Staff[];
  hours: WorkingHours[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState<{ staffId: string; day: number } | null>(
    null,
  );

  function removeShift(id: string) {
    startTransition(async () => {
      const result = await deleteShiftAction(id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {staff.map((member) => (
        <div key={member.id} className="rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-medium">
              {member.name}
              {!member.is_active && (
                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                  Hidden
                </span>
              )}
            </h3>
          </div>

          <div className="divide-y">
            {DAY_NAMES.map((dayName, dayIndex) => {
              const shifts = hours
                .filter(
                  (row) =>
                    row.staff_id === member.id && row.day_of_week === dayIndex,
                )
                .sort((a, b) => a.start_time.localeCompare(b.start_time));

              return (
                <div
                  key={dayName}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5"
                >
                  <span className="w-24 shrink-0 text-sm font-medium">
                    {dayName}
                  </span>

                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {shifts.length === 0 ? (
                      <span className="text-sm text-muted-foreground">
                        Off
                      </span>
                    ) : (
                      shifts.map((shift) => (
                        <span
                          key={shift.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-muted py-1 pl-3 pr-1 text-sm tabular-nums"
                        >
                          {formatWallTime(shift.start_time.slice(0, 5))} –{" "}
                          {formatWallTime(shift.end_time.slice(0, 5))}
                          <button
                            type="button"
                            onClick={() => removeShift(shift.id)}
                            disabled={pending}
                            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-destructive"
                            aria-label={`Remove ${dayName} shift`}
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setAdding({ staffId: member.id, day: dayIndex })
                    }
                    className="shrink-0 text-muted-foreground"
                  >
                    <Plus className="size-3.5" />
                    Shift
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <AddShiftDialog
        state={adding}
        onClose={() => setAdding(null)}
        staffName={
          staff.find((member) => member.id === adding?.staffId)?.name ?? ""
        }
      />
    </div>
  );
}

function AddShiftDialog({
  state,
  onClose,
  staffName,
}: {
  state: { staffId: string; day: number } | null;
  onClose: () => void;
  staffName: string;
}) {
  const router = useRouter();
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("19:00");
  const [pending, startTransition] = useTransition();

  function save() {
    if (!state) return;
    startTransition(async () => {
      const result = await addShiftAction({
        staffId: state.staffId,
        dayOfWeek: state.day,
        startTime,
        endTime,
      });
      if (result.ok) {
        toast.success(result.message);
        onClose();
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Add a shift{state ? ` — ${DAY_NAMES[state.day]}` : ""}
          </DialogTitle>
          <DialogDescription>
            {staffName}. Add a second shift for the same day to model a split.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="shift-start">Starts</Label>
            <Input
              id="shift-start"
              type="time"
              step={900}
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shift-end">Finishes</Label>
            <Input
              id="shift-end"
              type="time"
              step={900}
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Add shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------

export function TimeOffList({
  staff,
  timeOff,
}: {
  staff: Staff[];
  timeOff: TimeOff[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  const names = new Map(staff.map((member) => [member.id, member.name]));

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteTimeOffAction(id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="font-medium">Time off</h3>
          <p className="text-sm text-muted-foreground">
            Holidays and one-off blocks. These beat the weekly hours.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

      {timeOff.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <CalendarOff className="size-6 text-muted-foreground/60" aria-hidden />
          <p className="font-medium">Nobody&rsquo;s off</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Upcoming leave will show here and disappear from availability.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {timeOff.map((block) => (
            <li
              key={block.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">
                  {names.get(block.staff_id) ?? "Unknown"}
                  {block.reason && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · {block.reason}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(block.starts_at)} →{" "}
                  {formatDateTime(block.ends_at)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(block.id)}
                disabled={pending}
                aria-label="Remove time off"
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AddTimeOffDialog
        open={adding}
        onOpenChange={setAdding}
        staff={staff}
      />
    </div>
  );
}

function AddTimeOffDialog({
  open,
  onOpenChange,
  staff,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: Staff[];
}) {
  const router = useRouter();
  const today = todayInShop();
  const [draft, setDraft] = useState({
    staffId: staff[0]?.id ?? "",
    startDay: today,
    startTime: "00:00",
    endDay: today,
    endTime: "23:59",
    reason: "",
  });
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await addTimeOffAction(draft);
      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book time off</DialogTitle>
          <DialogDescription>
            Entered in shop time (Asia/Dubai). Any slot inside this range
            disappears immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Barber</Label>
            <Select
              value={draft.staffId}
              onValueChange={(value) =>
                setDraft((d) => ({ ...d, staffId: value }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a barber" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="off-start-day">From</Label>
              <Input
                id="off-start-day"
                type="date"
                value={draft.startDay}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, startDay: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="off-start-time" className="sr-only sm:not-sr-only">
                Start time
              </Label>
              <Input
                id="off-start-time"
                type="time"
                value={draft.startTime}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, startTime: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="off-end-day">Until</Label>
              <Input
                id="off-end-day"
                type="date"
                value={draft.endDay}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, endDay: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="off-end-time" className="sr-only sm:not-sr-only">
                End time
              </Label>
              <Input
                id="off-end-time"
                type="time"
                value={draft.endTime}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, endTime: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="off-reason">Reason</Label>
            <Input
              id="off-reason"
              value={draft.reason}
              onChange={(event) =>
                setDraft((d) => ({ ...d, reason: event.target.value }))
              }
              maxLength={120}
              placeholder="Annual leave"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !draft.staffId}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
