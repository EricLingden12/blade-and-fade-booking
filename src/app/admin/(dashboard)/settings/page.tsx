import type { Metadata } from "next";

import { CurrencyPicker } from "@/components/admin/currency-picker";
import { LocationEditor } from "@/components/admin/location-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getShopSettings } from "@/lib/queries/settings";
import { SHOP_TIMEZONE } from "@/lib/shop";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const { currency, location } = await getShopSettings();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shop-wide options that affect what customers see.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Currency</CardTitle>
        </CardHeader>
        <CardContent>
          <CurrencyPicker current={currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Location</CardTitle>
        </CardHeader>
        <CardContent>
          <LocationEditor current={location} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timezone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            All bookings and working hours are in{" "}
            <span className="font-medium">{SHOP_TIMEZONE}</span>.
          </p>
          <p className="text-muted-foreground">
            This is fixed in code (<code className="text-xs">src/lib/shop.ts</code>
            ). Changing it after bookings exist would reinterpret every stored
            working hour, so it is deliberately not editable here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
