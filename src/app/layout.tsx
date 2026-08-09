import type { Metadata, Viewport } from "next";
import { Inter, Oswald } from "next/font/google";

import { SHOP } from "@/lib/shop";

import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const oswald = Oswald({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${SHOP.fullName} — Book online in Dubai`,
    template: `%s · ${SHOP.name}`,
  },
  description:
    "Precision cuts, skin fades and beard work in Bur Dubai. Book your chair online in under a minute — no account, no phone calls.",
  openGraph: {
    title: `${SHOP.fullName}`,
    description: "Book your chair online in under a minute.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#171310",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${oswald.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* Toasts are mounted per-surface, not here: the public site renders on a
          dark ground and the admin dashboard on a light one, and sonner portals
          outside both, so each layout supplies its own explicitly themed one. */}
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
