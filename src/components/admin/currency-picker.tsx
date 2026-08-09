"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { updateCurrencyAction } from "@/app/admin/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CURRENCIES, formatMoney } from "@/lib/money";

export function CurrencyPicker({ current }: { current: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState(current);
  const [pending, startTransition] = useTransition();

  const changed = selected !== current;

  function save() {
    startTransition(async () => {
      const result = await updateCurrencyAction(selected);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
        setSelected(current);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="max-w-sm space-y-2">
        <Label htmlFor="currency">Display currency</Label>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger id="currency" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {CURRENCIES.map((currency) => (
              <SelectItem key={currency.code} value={currency.code}>
                <span className="font-medium">{currency.code}</span>
                <span className="text-muted-foreground">
                  {" "}
                  — {currency.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Show the effect on a real price before they commit to it. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <span className="text-muted-foreground">Preview</span>
        <span className="tabular-nums">
          {formatMoney(70, current)}
          {changed && (
            <>
              <span className="mx-2 text-muted-foreground">→</span>
              <span className="font-medium">{formatMoney(70, selected)}</span>
            </>
          )}
        </span>
        <span className="tabular-nums">
          {formatMoney(1250, current)}
          {changed && (
            <>
              <span className="mx-2 text-muted-foreground">→</span>
              <span className="font-medium">{formatMoney(1250, selected)}</span>
            </>
          )}
        </span>
      </div>

      <p className="flex max-w-xl items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          This changes the <strong>label</strong>, not the amount. A service
          priced 70 stays 70 — it becomes {formatMoney(70, selected)} rather
          than being converted at an exchange rate. Update the numbers on the{" "}
          <strong>Services</strong> page if you also want to re-price.
        </span>
      </p>

      <Button onClick={save} disabled={!changed || pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {changed ? "Save currency" : "Saved"}
      </Button>
    </div>
  );
}
