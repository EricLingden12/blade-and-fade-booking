"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/** The reference code, presented as the thing to screenshot or read out. */
export function CopyReference({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context, or the user said no). The code is
      // on screen in full, so there is nothing to recover from.
    }
  }

  return (
    <div className="mt-10 rounded-2xl border border-brand-400/30 bg-brand-400/8 px-6 py-5 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-400">
        Your reference
      </p>
      <div className="mt-2.5 flex items-center justify-center gap-3">
        <p className="font-display text-3xl font-bold tracking-[0.12em] text-ink-50 sm:text-4xl">
          {code}
        </p>
        <button
          type="button"
          onClick={copy}
          className={cn(
            "flex size-9 items-center justify-center rounded-lg border border-white/15 text-ink-300 transition-colors",
            "hover:bg-white/10 hover:text-ink-50",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400",
          )}
          aria-label={copied ? "Reference copied" : "Copy reference code"}
        >
          {copied ? (
            <Check className="size-4 text-brand-400" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
      </div>
      <p aria-live="polite" className="mt-2 text-xs text-ink-400">
        {copied ? "Copied to clipboard" : "Quote this if you need to call us"}
      </p>
    </div>
  );
}
