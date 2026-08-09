"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Info, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { updateShopHoursAction } from "@/app/admin/(dashboard)/schedule/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ShopHours } from "@/lib/database.types";
import { DAY_NAMES } from "@/lib/shop";
import { cn } from "@/lib/utils";

type Row = {
  dayOfWeek: number;
  isOpen: boolean;
  opens: string;
  closes: string;
};

/** Postgres hands back `10:00:00`; `<input type="time">` wants `10:00`. */
function toInputTime(value: string): string {
  return value.slice(0, 5);
}

function toRows(hours: ShopHours[]): Row[] {
  return [...hours]
    .sort((a, b) => a.day_of_week - b.day_of_week)
    .map((row) => ({
      dayOfWeek: row.day_of_week,
      isOpen: row.is_open,
      opens: toInputTime(row.opens),
      closes: toInputTime(row.closes),
    }));
}

export function ShopHoursEditor({ hours }: { hours: ShopHours[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<Row[]>(() => toRows(hours));

  const saved = toRows(hours);
  const dirty = JSON.stringify(rows) !== JSON.stringify(saved);

  const invalid = rows.some((row) => row.isOpen && row.closes <= row.opens);
  const openCount = rows.filter((row) => row.isOpen).length;

  function update(dayOfWeek: number, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) =>
        row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row,
      ),
    );
  }

  /** Copy Monday's hours down the week — the usual case, done in one click. */
  function applyMondayToAll() {
    const monday = rows.find((row) => row.dayOfWeek === 1);
    if (!monday) return;
    setRows((current) =>
      current.map((row) => ({
        ...row,
        isOpen: true,
        opens: monday.opens,
        closes: monday.closes,
      })),
    );
  }

  function save() {
    startTransition(async () => {
      const result = await updateShopHoursAction(rows);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-lg border">
        {rows.map((row, index) => (
          <div
            key={row.dayOfWeek}
            className={cn(
              "flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3",
              index > 0 && "border-t",
              !row.isOpen && "bg-muted/40",
            )}
          >
            <div className="flex min-w-40 items-center gap-3">
              <Switch
                id={`open-${row.dayOfWeek}`}
                checked={row.isOpen}
                onCheckedChange={(checked) =>
                  update(row.dayOfWeek, { isOpen: checked })
                }
                aria-label={`Open on ${DAY_NAMES[row.dayOfWeek]}`}
              />
              <label
                htmlFor={`open-${row.dayOfWeek}`}
                className={cn(
                  "text-sm font-medium",
                  !row.isOpen && "text-muted-foreground",
                )}
              >
                {DAY_NAMES[row.dayOfWeek]}
              </label>
            </div>

            {row.isOpen ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="time"
                  value={row.opens}
                  step={900}
                  onChange={(event) =>
                    update(row.dayOfWeek, { opens: event.target.value })
                  }
                  className="w-32"
                  aria-label={`${DAY_NAMES[row.dayOfWeek]} opening time`}
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={row.closes}
                  step={900}
                  onChange={(event) =>
                    update(row.dayOfWeek, { closes: event.target.value })
                  }
                  aria-invalid={row.closes <= row.opens}
                  className="w-32"
                  aria-label={`${DAY_NAMES[row.dayOfWeek]} closing time`}
                />
                {row.closes <= row.opens && (
                  <span className="text-xs font-medium text-destructive">
                    Closing must be after opening
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Closed</span>
            )}
          </div>
        ))}
      </div>

      <p className="flex max-w-2xl items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          These are the shop&rsquo;s doors. A barber&rsquo;s shift is trimmed to
          fit inside them, so someone rostered until 7pm in a shop that closes at
          6pm stops taking bookings at 6pm. Closing a day here closes it for
          everyone.
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={!dirty || invalid || pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {dirty ? "Save opening hours" : "Saved"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={applyMondayToAll}
          disabled={pending}
        >
          Use Monday&rsquo;s hours all week
        </Button>
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setRows(saved)}
            disabled={pending}
          >
            <RotateCcw className="size-4" />
            Undo changes
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          Open {openCount} of 7 days
        </span>
      </div>
    </div>
  );
}
