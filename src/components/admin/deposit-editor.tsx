"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { updateDepositAction } from "@/app/admin/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { currencyDecimals, currencySymbol, formatMoney } from "@/lib/money";

export function DepositEditor({
  enabled: savedEnabled,
  amount: savedAmount,
  currency,
  stripeMode,
}: {
  enabled: boolean;
  amount: number;
  currency: string;
  /** null when this deployment has no Stripe keys at all. */
  stripeMode: "test" | "live" | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(savedEnabled);
  const [amount, setAmount] = useState(String(savedAmount || ""));

  const parsedAmount = Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= 0;
  const needsAmount = enabled && (!amountValid || parsedAmount <= 0);
  const dirty = enabled !== savedEnabled || parsedAmount !== savedAmount;

  const decimals = currencyDecimals(currency);
  const step = decimals === 0 ? "1" : `0.${"0".repeat(decimals - 1)}1`;

  function save() {
    startTransition(async () => {
      const result = await updateDepositAction({
        enabled,
        amount: amountValid ? parsedAmount : 0,
      });
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
      {stripeMode === null ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-amber-500"
            aria-hidden
          />
          <div>
            <p className="font-medium">Stripe isn&rsquo;t connected</p>
            <p className="mt-1 text-muted-foreground">
              You can set a deposit here, but nobody will be charged until
              <code className="mx-1 text-xs">STRIPE_SECRET_KEY</code> and
              <code className="mx-1 text-xs">STRIPE_WEBHOOK_SECRET</code> are
              set. Until then bookings confirm straight away, as they do now.
            </p>
          </div>
        </div>
      ) : stripeMode === "live" ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden
          />
          <div>
            <p className="font-medium">Live Stripe keys — real money</p>
            <p className="mt-1 text-muted-foreground">
              Customers will actually be charged. Use test keys
              (<code className="text-xs">sk_test_…</code>) if you&rsquo;re
              demonstrating this.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <p className="font-medium">Stripe test mode</p>
          <p className="mt-1 text-muted-foreground">
            No real money moves. Pay with card{" "}
            <code className="text-xs">4242 4242 4242 4242</code>, any future
            expiry, any CVC.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Switch
          id="deposit-enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
        <Label htmlFor="deposit-enabled" className="cursor-pointer">
          Ask for a deposit when booking
        </Label>
      </div>

      {enabled && (
        <div className="max-w-xs space-y-2">
          <Label htmlFor="deposit-amount">Deposit amount</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {currencySymbol(currency)}
            </span>
            <Input
              id="deposit-amount"
              type="number"
              min="0"
              step={step}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={needsAmount}
              className="pl-9 tabular-nums"
            />
          </div>
          {needsAmount ? (
            <p className="text-xs font-medium text-destructive">
              Set an amount, or switch deposits off.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Charged in {currency}, the shop&rsquo;s currency. Comes off the
              bill in the chair.
            </p>
          )}
        </div>
      )}

      <p className="flex max-w-2xl items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          {enabled && amountValid && parsedAmount > 0 ? (
            <>
              A customer pays{" "}
              <strong>{formatMoney(parsedAmount, currency)}</strong> to hold the
              chair, and the rest in the shop. The slot is reserved for 30
              minutes while they pay; if they don&rsquo;t finish, it goes back on
              sale automatically.
            </>
          ) : (
            <>
              With deposits off, a booking is confirmed the moment it&rsquo;s
              made and nothing is charged. Deposits mainly exist to cut
              no-shows.
            </>
          )}
        </span>
      </p>

      <p className="max-w-2xl text-sm text-muted-foreground">
        Changing this only affects <strong>new</strong> bookings. Anyone who has
        already paid keeps what they paid, and existing bookings are untouched.
      </p>

      <Button onClick={save} disabled={!dirty || needsAmount || pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {dirty ? "Save deposit settings" : "Saved"}
      </Button>
    </div>
  );
}
