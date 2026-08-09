import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminNotFound() {
  return (
    <div className="mx-auto w-full max-w-lg pt-12">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <h1 className="font-display text-xl font-semibold uppercase tracking-wide">
            Not found
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            That booking may have been deleted, or the link is wrong.
          </p>
          <Button asChild className="mt-2">
            <Link href="/admin/bookings">Back to bookings</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
