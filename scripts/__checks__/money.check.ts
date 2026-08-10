/**
 * Money conversion for charging.
 *
 *   npx tsx scripts/__checks__/money.check.ts
 *
 * This is the one file in the project where a bug costs real money. Payment
 * processors take integers in a currency's smallest unit, and how many of those
 * make a whole differs by currency — so getting it wrong doesn't produce a
 * rounding error, it charges someone 100× or 1/100× the right amount.
 */

import {
  currencyDecimals,
  formatMoney,
  fromMinorUnits,
  minorUnitsPerWhole,
  toMinorUnits,
} from "@/lib/money";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  const ok = a === b;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) {
    console.log(`        actual   ${a}`);
    console.log(`        expected ${b}`);
  }
}

console.log("\nminor units per whole");

check("AED has 100", minorUnitsPerWhole("AED"), 100);
check("USD has 100", minorUnitsPerWhole("USD"), 100);
check("JPY has none — yen are indivisible", minorUnitsPerWhole("JPY"), 1);
check("KRW has none", minorUnitsPerWhole("KRW"), 1);
check("VND has none", minorUnitsPerWhole("VND"), 1);
check("KWD has 1000 — three decimal places", minorUnitsPerWhole("KWD"), 1000);
check("BHD has 1000", minorUnitsPerWhole("BHD"), 1000);
check("lowercase input is handled", minorUnitsPerWhole("jpy"), 1);
check("an unknown code assumes the common case", minorUnitsPerWhole("ZZZ"), 100);

console.log("\ndecimals shown in inputs");

check("AED shows 2", currencyDecimals("AED"), 2);
check("JPY shows 0", currencyDecimals("JPY"), 0);
check("KWD shows 3", currencyDecimals("KWD"), 3);

console.log("\ntoMinorUnits");

check("20 AED is 2000 fils", toMinorUnits(20, "AED"), 2000);
check("20.50 AED keeps the halves", toMinorUnits(20.5, "AED"), 2050);
check("0.01 AED is one fil", toMinorUnits(0.01, "AED"), 1);
check("1500 JPY stays 1500, not 150000", toMinorUnits(1500, "JPY"), 1500);
check("5000 KRW stays 5000", toMinorUnits(5000, "KRW"), 5000);
check("a whole KWD is 1000 fils", toMinorUnits(1, "KWD"), 1000);

// Stripe rejects three-decimal amounts that aren't a multiple of 10.
check("KWD 1.234 snaps to a multiple of 10", toMinorUnits(1.234, "KWD"), 1230);
check("KWD 1.239 snaps upward", toMinorUnits(1.239, "KWD"), 1240);
check(
  "every KWD amount is a multiple of 10",
  [0.001, 1.111, 12.345, 99.999].every(
    (value) => toMinorUnits(value, "KWD") % 10 === 0,
  ),
  true,
);

console.log("\nfloating point");

// 19.99 * 100 is 1998.9999999999998 in IEEE 754. Truncating would undercharge.
check("19.99 AED does not lose a fil to float error", toMinorUnits(19.99, "AED"), 1999);
check("0.29 does not lose a fil", toMinorUnits(0.29, "AED"), 29);
// 1.005 has no exact binary representation — the nearest double is a hair
// *below* it, so 1.005 * 100 is 100.49999999999999 and rounds down. Recorded
// here as the honest result rather than the arithmetically "expected" 101.
// It cannot arise in practice: a two-decimal currency's input has a 0.01 step.
check("1.005 lands on 100, because it isn't really 1.005", toMinorUnits(1.005, "AED"), 100);
check(
  "no amount 0.01-100.00 is ever undercharged",
  (() => {
    for (let cents = 1; cents <= 10000; cents += 1) {
      const whole = cents / 100;
      if (toMinorUnits(whole, "AED") !== cents) return `broke at ${whole}`;
    }
    return true;
  })(),
  true,
);

console.log("\nround trip");

check("2000 fils back to 20 AED", fromMinorUnits(2000, "AED"), 20);
check("1500 back to 1500 JPY", fromMinorUnits(1500, "JPY"), 1500);
check("1000 back to 1 KWD", fromMinorUnits(1000, "KWD"), 1);
check(
  "AED survives a round trip",
  fromMinorUnits(toMinorUnits(37.45, "AED"), "AED"),
  37.45,
);

console.log("\nformatting still behaves");

// Intl separates the code from the number with a non-breaking space (U+00A0)
// so a price never wraps mid-value. Comparing against a plain space here would
// fail for a reason that has nothing to do with money.
const NBSP = "\u00A0";

check("whole amounts drop trailing zeroes", formatMoney(70, "AED"), `AED${NBSP}70`);
check("an unknown code still renders", formatMoney(70, "ZZZ"), `ZZZ${NBSP}70`);
check(
  "prices use a non-breaking space so they never wrap mid-value",
  formatMoney(1250, "AED").includes(NBSP),
  true,
);

if (failures > 0) {
  console.log(`\n${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log("\nALL PASS\n");
