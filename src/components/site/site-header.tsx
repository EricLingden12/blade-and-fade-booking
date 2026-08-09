"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";

import { Logo } from "@/components/site/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SHOP } from "@/lib/shop";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/#services", label: "Services" },
  { href: "/#barbers", label: "Barbers" },
  { href: "/#visit", label: "Visit" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The booking flow is its own focused surface; drop the marketing nav there.
  const minimal = pathname.startsWith("/book");

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-colors duration-300",
        scrolled || minimal
          ? "border-b border-white/10 bg-ink-950/85 backdrop-blur-md"
          : "border-b border-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Logo className="text-ink-50" />

        {!minimal && (
          <nav
            aria-label="Main"
            className="hidden items-center gap-8 md:flex"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-ink-300 transition-colors hover:text-ink-50"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            className="bg-brand-400 font-semibold text-ink-950 hover:bg-brand-300"
          >
            <Link href="/book">Book now</Link>
          </Button>

          {!minimal && (
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-ink-200 hover:bg-white/10 hover:text-ink-50 md:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-72 border-white/10 bg-ink-950 text-ink-100"
              >
                <SheetHeader>
                  <SheetTitle className="text-left text-ink-50">
                    {SHOP.name}
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 px-4">
                  {NAV_LINKS.map((link) => (
                    <SheetClose asChild key={link.href}>
                      <Link
                        href={link.href}
                        className="rounded-md px-3 py-3 text-base font-medium text-ink-200 transition-colors hover:bg-white/5 hover:text-ink-50"
                      >
                        {link.label}
                      </Link>
                    </SheetClose>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>
    </header>
  );
}
