"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin] unhandled:", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-lg pt-12">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <h1 className="font-display text-xl font-semibold uppercase tracking-wide">
            Couldn&rsquo;t load that
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Something went wrong reading from the database. Your data is fine —
            this is just this page.
          </p>
          <Button onClick={reset} className="mt-2">
            <RefreshCw className="size-4" />
            Try again
          </Button>
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground">
              Reference: {error.digest}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
