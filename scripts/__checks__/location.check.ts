/**
 * Location parsing and URL building.
 *
 * The interesting surface is `parseCoordinates`: an admin pastes whatever their
 * phone or browser gave them, and every shape has to land on the same pin — or
 * be rejected cleanly rather than silently producing a wrong one.
 *
 * Run with `npm run check`.
 */

import {
  appleMapsUrl,
  directionsUrl,
  formatAddress,
  hasPin,
  isShortMapLink,
  mapEmbedUrl,
  parseAddressLines,
  parseCoordinates,
  type ShopLocation,
} from "../../src/lib/location";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}\n      expected ${b}\n      actual   ${a}`);
  }
}

const DUBAI = { latitude: 25.2636, longitude: 55.2972 };

console.log("\nparseCoordinates — accepted shapes");

check("bare pair", parseCoordinates("25.2636, 55.2972"), DUBAI);
check("bare pair, no space", parseCoordinates("25.2636,55.2972"), DUBAI);
check("bare pair, space only", parseCoordinates("25.2636 55.2972"), DUBAI);
check("surrounding whitespace", parseCoordinates("  25.2636, 55.2972  "), DUBAI);

check(
  "google place URL prefers the !3d/!4d pin over the @ viewport",
  parseCoordinates(
    "https://www.google.com/maps/place/Blade+%26+Fade/@25.9999,55.9999,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d25.2636!4d55.2972",
  ),
  DUBAI,
);
check(
  "google viewport URL",
  parseCoordinates("https://www.google.com/maps/@25.2636,55.2972,17z"),
  DUBAI,
);
check(
  "google search api URL",
  parseCoordinates(
    "https://www.google.com/maps/search/?api=1&query=25.2636,55.2972",
  ),
  DUBAI,
);
check(
  "classic maps ?q=",
  parseCoordinates("https://maps.google.com/?q=25.2636,55.2972"),
  DUBAI,
);
check(
  "apple maps ?ll=",
  parseCoordinates("https://maps.apple.com/?ll=25.2636,55.2972&q=Shop"),
  DUBAI,
);
check(
  "southern/western hemisphere negatives",
  parseCoordinates("-33.8688, -151.2093"),
  { latitude: -33.8688, longitude: -151.2093 },
);
check("integer coordinates", parseCoordinates("25, 55"), {
  latitude: 25,
  longitude: 55,
});
check(
  "precision is clamped to numeric(9,6) so the column never rejects it",
  parseCoordinates("25.26361234567, 55.29721234567"),
  { latitude: 25.263612, longitude: 55.297212 },
);

console.log("\nparseCoordinates — rejected shapes");

check("empty string", parseCoordinates(""), null);
check("whitespace only", parseCoordinates("   "), null);
check("plain address text", parseCoordinates("Al Fahidi Street, Dubai"), null);
check("a single number", parseCoordinates("25.2636"), null);
check("latitude out of range", parseCoordinates("91.0, 55.2972"), null);
check("longitude out of range", parseCoordinates("25.2636, 181.0"), null);
check("null island is treated as a bad parse", parseCoordinates("0, 0"), null);
check(
  "short link carries no coordinates",
  parseCoordinates("https://maps.app.goo.gl/AbCdEf123"),
  null,
);
check(
  "a URL with no coordinate-shaped params",
  parseCoordinates("https://www.google.com/maps/place/Blade+Fade"),
  null,
);

console.log("\nisShortMapLink");

check("goo.gl app link", isShortMapLink("https://maps.app.goo.gl/AbCdEf"), true);
check("legacy goo.gl/maps", isShortMapLink("https://goo.gl/maps/AbCdEf"), true);
check(
  "full google URL is not short",
  isShortMapLink("https://www.google.com/maps/@25.2636,55.2972,17z"),
  false,
);
check("bare coordinates are not a link", isShortMapLink("25.2636, 55.2972"), false);

console.log("\nparseAddressLines");

check(
  "splits, trims and drops blanks",
  parseAddressLines("  Unit 4, Al Fahidi Street \n\n Bur Dubai, UAE \n"),
  ["Unit 4, Al Fahidi Street", "Bur Dubai, UAE"],
);
check("handles CRLF", parseAddressLines("Line one\r\nLine two"), [
  "Line one",
  "Line two",
]);
check("empty input yields no lines", parseAddressLines("   \n  \n "), []);
check(
  "caps at four lines so the DB constraint can't be tripped",
  parseAddressLines("a\nb\nc\nd\ne\nf"),
  ["a", "b", "c", "d"],
);

console.log("\nURL building");

const pinned: ShopLocation = {
  addressLines: ["Unit 4, Al Fahidi Street", "Bur Dubai, UAE"],
  latitude: 25.2636,
  longitude: 55.2972,
  mapUrl: null,
  directionsNote: null,
};
const unpinned: ShopLocation = { ...pinned, latitude: null, longitude: null };
const overridden: ShopLocation = {
  ...pinned,
  mapUrl: "https://maps.google.com/curated-listing",
};

check("hasPin true when both set", hasPin(pinned), true);
check("hasPin false when cleared", hasPin(unpinned), false);
check(
  "formatAddress joins with commas",
  formatAddress(pinned),
  "Unit 4, Al Fahidi Street, Bur Dubai, UAE",
);
check(
  "embed URL centres the bbox on the pin and drops a marker",
  mapEmbedUrl({ latitude: 25.2636, longitude: 55.2972 }, 0.006),
  "https://www.openstreetmap.org/export/embed.html?bbox=55.2942,25.2606,55.3002,25.2666&layer=mapnik&marker=25.2636,55.2972",
);
check(
  "directions use the pin when there is one",
  directionsUrl(pinned),
  "https://www.google.com/maps/search/?api=1&query=25.2636,55.2972",
);
check(
  "directions fall back to an address search with no pin",
  directionsUrl(unpinned),
  "https://www.google.com/maps/search/?api=1&query=Unit%204%2C%20Al%20Fahidi%20Street%2C%20Bur%20Dubai%2C%20UAE",
);
check(
  "an admin-supplied link wins over the generated one",
  directionsUrl(overridden),
  "https://maps.google.com/curated-listing",
);
check(
  "apple maps gets coordinates plus a label",
  appleMapsUrl(pinned),
  "https://maps.apple.com/?ll=25.2636,55.2972&q=Unit%204%2C%20Al%20Fahidi%20Street",
);

if (failures > 0) {
  console.error(`\n${failures} location check(s) failed.\n`);
  process.exit(1);
}
console.log("\nAll location checks passed.\n");
