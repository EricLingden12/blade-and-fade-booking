"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ExternalLink, Info, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

import { updateLocationAction } from "@/app/admin/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  formatCoordinates,
  isShortMapLink,
  MAX_ADDRESS_LINES,
  mapEmbedUrl,
  parseCoordinates,
  type ShopLocation,
} from "@/lib/location";

export function LocationEditor({ current }: { current: ShopLocation }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [address, setAddress] = useState(current.addressLines.join("\n"));
  const [coordinates, setCoordinates] = useState(
    current.latitude !== null && current.longitude !== null
      ? `${current.latitude}, ${current.longitude}`
      : "",
  );
  const [mapUrl, setMapUrl] = useState(current.mapUrl ?? "");
  const [directionsNote, setDirectionsNote] = useState(
    current.directionsNote ?? "",
  );

  // Preview the pin as they type. A short link can't be resolved in the
  // browser, so the preview stays empty and the hint below explains why —
  // the server still expands it on save.
  const pin = useMemo(() => parseCoordinates(coordinates), [coordinates]);
  const pendingShortLink = !pin && isShortMapLink(coordinates);
  const unparsed = coordinates.trim() !== "" && !pin && !pendingShortLink;

  function save() {
    startTransition(async () => {
      const result = await updateLocationAction({
        address,
        coordinates,
        mapUrl,
        directionsNote,
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
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              rows={MAX_ADDRESS_LINES}
              placeholder={"Unit 4, Al Fahidi Street\nBur Dubai, Dubai, UAE"}
              className="resize-none font-medium"
            />
            <p className="text-xs text-muted-foreground">
              One line per row, up to {MAX_ADDRESS_LINES}. Shown in the footer,
              on the booking confirmation and in the map card.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="coordinates">Map pin</Label>
            <Input
              id="coordinates"
              value={coordinates}
              onChange={(event) => setCoordinates(event.target.value)}
              placeholder="Paste a Google Maps link, or 25.2636, 55.2972"
              aria-invalid={unparsed}
              spellCheck={false}
            />
            {unparsed ? (
              <p className="text-xs font-medium text-destructive">
                No coordinates in that. Paste the full Google Maps URL from the
                address bar, or type latitude, longitude.
              </p>
            ) : pendingShortLink ? (
              <p className="text-xs text-muted-foreground">
                Short link — we&rsquo;ll expand it when you save. The preview
                stays blank until then.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Right-click your shop in Google Maps and choose the coordinates
                to copy them, or just paste the whole link. Leave empty to hide
                the map.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="directionsNote">
              Finding us{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="directionsNote"
              value={directionsNote}
              onChange={(event) => setDirectionsNote(event.target.value)}
              placeholder="Above the pharmacy — entrance on the side street"
              maxLength={240}
            />
            <p className="text-xs text-muted-foreground">
              The things a map pin can&rsquo;t say. Shown under the address.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mapUrl">
              Directions link{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="mapUrl"
              value={mapUrl}
              onChange={(event) => setMapUrl(event.target.value)}
              placeholder="https://maps.google.com/…"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Overrides where the &ldquo;Get directions&rdquo; button goes. Use
              it to point at your Google Business listing. Otherwise we build
              the link from the pin.
            </p>
          </div>
        </div>

        {/* The whole point of a pin is that it's either right or it isn't, and
            only a map can tell you which. */}
        <div className="space-y-2">
          <Label>Preview</Label>
          <div className="overflow-hidden rounded-lg border bg-muted/40">
            {pin ? (
              <iframe
                key={`${pin.latitude},${pin.longitude}`}
                title="Map preview of the shop location"
                src={mapEmbedUrl(pin)}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="aspect-4/3 w-full border-0"
              />
            ) : (
              <div className="flex aspect-4/3 flex-col items-center justify-center gap-2 px-6 text-center">
                <MapPin className="size-6 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  {coordinates.trim()
                    ? "Nothing to show yet."
                    : "No pin set — the map section is hidden on the site."}
                </p>
              </div>
            )}
          </div>
          {pin && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">{formatCoordinates(pin)}</span>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${pin.latitude},${pin.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground"
              >
                Check on Google Maps
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
          )}
        </div>
      </div>

      <p className="flex max-w-2xl items-start gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          The map is drawn by OpenStreetMap, so it needs no API key and
          can&rsquo;t run up a bill. The &ldquo;Get directions&rdquo; buttons
          still hand off to Google or Apple Maps, whichever the visitor&rsquo;s
          device prefers.
        </span>
      </p>

      <Button onClick={save} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Save location
      </Button>
    </div>
  );
}
