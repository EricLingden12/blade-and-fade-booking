"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Info, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { updateBookingRulesAction } from "@/app/admin/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type BookingRulesValues = {
  turnaroundMinutes: number;
  slotIntervalMinutes: number;
  leadTimeMinutes: number;
  maxAdvanceDays: number;
};

/** Divisors of 60. Anything else drifts offered times off the clock. */
const INTERVALS = [5, 10, 15, 20, 30, 60];

export function BookingRulesEditor({ current }: { current: BookingRulesValues }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<BookingRulesValues>(current);

  const dirty = (Object.keys(current) as Array<keyof BookingRulesValues>).some(
    (key) => values[key] !== current[key],
  );

  function set(key: keyof BookingRulesValues, raw: string) {
    const parsed = Number(raw);
    setValues((v) => ({ ...v, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  }

  function save() {
    startTransition(async () => {
      const result = await updateBookingRulesAction(values);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="turnaround"
          label="Gap between appointments"
          hint="Time kept clear either side of every booking — sweeping up, cleaning clippers, letting one customer leave before the next sits down."
        >
          <Suffix suffix="minutes">
            <Input
              id="turnaround"
              type="number"
              min={0}
              max={120}
              step={5}
              value={values.turnaroundMinutes}
              onChange={(e) => set("turnaroundMinutes", e.target.value)}
              className="tabular-nums"
            />
          </Suffix>
        </Field>

        <Field
          id="interval"
          label="Offer times every"
          hint="The grid start times sit on. 15 gives :00, :15, :30, :45."
        >
          <Select
            value={String(values.slotIntervalMinutes)}
            onValueChange={(v) => set("slotIntervalMinutes", v)}
          >
            <SelectTrigger id="interval" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVALS.map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {minutes} minutes
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          id="lead"
          label="Minimum notice"
          hint="How far ahead a booking must be, so nobody books the chair you're already standing at."
        >
          <Suffix suffix="minutes">
            <Input
              id="lead"
              type="number"
              min={0}
              max={10080}
              step={15}
              value={values.leadTimeMinutes}
              onChange={(e) => set("leadTimeMinutes", e.target.value)}
              className="tabular-nums"
            />
          </Suffix>
        </Field>

        <Field
          id="advance"
          label="Book up to"
          hint="How far into the future the calendar opens."
        >
          <Suffix suffix="days ahead">
            <Input
              id="advance"
              type="number"
              min={1}
              max={365}
              step={1}
              value={values.maxAdvanceDays}
              onChange={(e) => set("maxAdvanceDays", e.target.value)}
              className="tabular-nums"
            />
          </Suffix>
        </Field>
      </div>

      <p className="flex max-w-2xl items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong>How long a haircut takes</strong> is set per service on the{" "}
          <strong>Services</strong> page — these rules apply between and around
          appointments, whatever the service. The gap is used when working out
          what to offer, not enforced on the booking itself, so you can still
          book back-to-back by hand when someone walks in.
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={!dirty || pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {dirty ? "Save booking rules" : "Saved"}
        </Button>
        {dirty && (
          <Button
            variant="ghost"
            onClick={() => setValues(current)}
            disabled={pending}
          >
            <RotateCcw className="size-4" />
            Undo changes
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  );
}

function Suffix({
  suffix,
  children,
}: {
  suffix: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-28">{children}</div>
      <span className="text-sm text-muted-foreground">{suffix}</span>
    </div>
  );
}
