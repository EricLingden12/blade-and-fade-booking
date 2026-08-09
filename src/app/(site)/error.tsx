"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SHOP } from "@/lib/shop";

export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[site] unhandled:", error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-5 py-28 text-center sm:py-40">
      <p className="eyebrow">Something broke</p>
      <h1 className="mt-4 font-display text-4xl font-bold uppercase tracking-tight text-ink-50">
        That didn&rsquo;t work
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-400">
        Nothing was booked. Try again, or call the shop on{" "}
        <a
          href={`tel:${SHOP.phone.replace(/\s/g, "")}`}
          className="font-medium text-brand-400 underline-offset-4 hover:underline"
        >
          {SHOP.phone}
        </a>
        .
      </p>
      <Button
        onClick={reset}
        className="mt-7 bg-brand-400 font-semibold text-ink-950 hover:bg-brand-300"
      >
        <RefreshCw className="size-4" />
        Try again
      </Button>
      {error.digest && (
        <p className="mt-6 font-mono text-xs text-ink-600">
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
