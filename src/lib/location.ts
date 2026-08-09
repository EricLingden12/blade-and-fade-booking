/**
 * Shop location: parsing what an admin pastes, and building the URLs the site
 * renders from it.
 *
 * Deliberately dependency-free and side-effect-free so it can be unit checked
 * (`scripts/__checks__/location.check.ts`) without a database or a network.
 */

export type ShopLocation = {
  addressLines: string[];
  /** Null together with `longitude` when no pin has been dropped yet. */
  latitude: number | null;
  longitude: number | null;
  /** Admin override for the directions link; built from coordinates when null. */
  mapUrl: string | null;
  directionsNote: string | null;
};

export type Coordinates = { latitude: number; longitude: number };

/** Bur Dubai. Used only when the settings row can't be read. */
export const DEFAULT_LOCATION: ShopLocation = {
  addressLines: ["Unit 4, Al Fahidi Street", "Bur Dubai, Dubai, UAE"],
  latitude: 25.2636,
  longitude: 55.2972,
  mapUrl: null,
  directionsNote: null,
};

export const MAX_ADDRESS_LINES = 4;

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

/** `25.2637, 55.2972` — what you get from "copy coordinates" in either app. */
const BARE_PAIR = /^(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/;

/**
 * `!3d25.2637!4d55.2972` — the place's *own* coordinates, buried in the `data`
 * segment of a Google Maps place URL. Preferred over `@` because `@` is only
 * wherever the viewport happened to be centred.
 */
const GOOGLE_PLACE = /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/;

/** `/@25.2637,55.2972,17z` — the map viewport centre. */
const GOOGLE_VIEWPORT = /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/;

/** Query params that carry a coordinate pair across Google and Apple Maps. */
const COORD_PARAMS = ["query", "q", "ll", "daddr", "sll", "center"];

/**
 * Short links (`maps.app.goo.gl`, `goo.gl/maps`) carry no coordinates at all —
 * they're opaque keys that only Google's redirector can expand. Callers that
 * can reach the network should resolve them first; the admin action does.
 */
export function isShortMapLink(input: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(
    input.trim(),
  );
}

function validate(lat: number, lon: number): Coordinates | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lon < -180 || lon > 180) return null;
  // 0,0 is in the Atlantic. It is almost always a parse that went wrong rather
  // than a barbershop on Null Island.
  if (lat === 0 && lon === 0) return null;
  return { latitude: round6(lat), longitude: round6(lon) };
}

/** Six decimal places is ~11cm. The column is numeric(9,6); don't exceed it. */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Pull a coordinate pair out of whatever the admin pasted.
 *
 * Accepts a bare `lat, lng`, a Google Maps place or viewport URL, and the
 * common `?q=` / `?ll=` / `?query=` forms used by both Google and Apple Maps.
 * Returns null when there's nothing coordinate-shaped in there.
 */
export function parseCoordinates(input: string): Coordinates | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const bare = BARE_PAIR.exec(trimmed);
  if (bare) return validate(Number(bare[1]), Number(bare[2]));

  // A place's own pin beats the viewport centre, which can be metres off.
  const place = GOOGLE_PLACE.exec(trimmed);
  if (place) {
    const parsed = validate(Number(place[1]), Number(place[2]));
    if (parsed) return parsed;
  }

  const fromParams = parseFromQueryString(trimmed);
  if (fromParams) return fromParams;

  const viewport = GOOGLE_VIEWPORT.exec(trimmed);
  if (viewport) return validate(Number(viewport[1]), Number(viewport[2]));

  return null;
}

function parseFromQueryString(input: string): Coordinates | null {
  let params: URLSearchParams;
  try {
    params = new URL(input).searchParams;
  } catch {
    return null;
  }

  for (const key of COORD_PARAMS) {
    const value = params.get(key);
    if (!value) continue;
    const pair = BARE_PAIR.exec(value.trim());
    if (!pair) continue;
    const parsed = validate(Number(pair[1]), Number(pair[2]));
    if (parsed) return parsed;
  }
  return null;
}

/** Splits a textarea into address lines, dropping blanks and trimming each. */
export function parseAddressLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_ADDRESS_LINES);
}

/* -------------------------------------------------------------------------- */
/* URLs                                                                       */
/* -------------------------------------------------------------------------- */

export function hasPin(
  location: ShopLocation,
): location is ShopLocation & Coordinates {
  return location.latitude !== null && location.longitude !== null;
}

export function formatAddress(location: ShopLocation): string {
  return location.addressLines.join(", ");
}

/**
 * OpenStreetMap's embed endpoint.
 *
 * Chosen over Google's iframe because it needs no API key, no billing account
 * and no per-load quota — the map keeps working whether or not anyone maintains
 * a Google Cloud project. `bbox` sets the zoom; `marker` drops the pin.
 */
export function mapEmbedUrl(
  { latitude, longitude }: Coordinates,
  spanDegrees = 0.006,
): string {
  const half = spanDegrees / 2;
  const bbox = [
    clampLon(longitude - half),
    clampLat(latitude - half),
    clampLon(longitude + half),
    clampLat(latitude + half),
  ].join(",");

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;
}

const clampLat = (value: number) => Math.min(90, Math.max(-90, round6(value)));
const clampLon = (value: number) =>
  Math.min(180, Math.max(-180, round6(value)));

/**
 * The "Get directions" target.
 *
 * An admin-supplied `map_url` wins — if someone curated a link to their actual
 * Google Business listing, that's better than a dropped pin. Otherwise route by
 * coordinates, falling back to a text search when there's no pin at all.
 */
export function directionsUrl(location: ShopLocation): string {
  if (location.mapUrl) return location.mapUrl;

  if (hasPin(location)) {
    return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    formatAddress(location),
  )}`;
}

/** iOS opens Apple Maps natively; sending it a Google URL is a worse landing. */
export function appleMapsUrl(location: ShopLocation): string {
  if (hasPin(location)) {
    return `https://maps.apple.com/?ll=${location.latitude},${location.longitude}&q=${encodeURIComponent(
      location.addressLines[0] ?? "Shop",
    )}`;
  }
  return `https://maps.apple.com/?q=${encodeURIComponent(formatAddress(location))}`;
}

/** `25.2636, 55.2972` for display next to the pin. */
export function formatCoordinates({ latitude, longitude }: Coordinates): string {
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}
