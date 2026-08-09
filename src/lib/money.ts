/**
 * Currency formatting.
 *
 * The shop's currency is a *display* setting, stored in `shop_settings`. Prices
 * live in `services.price` as a plain numeric with no currency attached, so
 * switching from AED to USD relabels 70 as $70 — it does not convert to ~19.
 * Converting would need live FX rates and a decision about when to re-price,
 * which is a different feature; the admin UI says so plainly.
 */

export const DEFAULT_CURRENCY = "AED";

/** Currencies offered in the admin picker. ISO 4217 codes. */
export const CURRENCIES = [
  { code: "AED", label: "UAE Dirham" },
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "NPR", label: "Nepalese Rupee" },
  { code: "INR", label: "Indian Rupee" },
  { code: "PKR", label: "Pakistani Rupee" },
  { code: "BDT", label: "Bangladeshi Taka" },
  { code: "LKR", label: "Sri Lankan Rupee" },
  { code: "SAR", label: "Saudi Riyal" },
  { code: "QAR", label: "Qatari Riyal" },
  { code: "KWD", label: "Kuwaiti Dinar" },
  { code: "TRY", label: "Turkish Lira" },
  { code: "EGP", label: "Egyptian Pound" },
  { code: "ZAR", label: "South African Rand" },
  { code: "NGN", label: "Nigerian Naira" },
  { code: "KES", label: "Kenyan Shilling" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "SGD", label: "Singapore Dollar" },
  { code: "MYR", label: "Malaysian Ringgit" },
  { code: "PHP", label: "Philippine Peso" },
  { code: "IDR", label: "Indonesian Rupiah" },
  { code: "THB", label: "Thai Baht" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "CNY", label: "Chinese Yuan" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "SEK", label: "Swedish Krona" },
  { code: "NZD", label: "New Zealand Dollar" },
  { code: "BRL", label: "Brazilian Real" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

const VALID_CODES = new Set<string>(CURRENCIES.map((item) => item.code));

export function isSupportedCurrency(code: string): boolean {
  return VALID_CODES.has(code.toUpperCase());
}

/**
 * `AED 70`, `$70`, `Rs 1,200`, `¥1,500`.
 *
 * Fraction digits are 0–2 rather than a currency's natural default, so whole
 * prices read as "70" not "70.00" — a barber's menu never shows trailing
 * zeroes. Falls back to `CODE amount` if the runtime doesn't know the code.
 */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString("en", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  }
}

/** The bare symbol, for input adornments and short labels. */
export function currencySymbol(currency: string): string {
  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

export function currencyLabel(code: string): string {
  return CURRENCIES.find((item) => item.code === code)?.label ?? code;
}
