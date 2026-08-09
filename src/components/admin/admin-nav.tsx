"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarClock,
  CalendarRange,
  LayoutDashboard,
  LogOut,
  Menu,
  Scissors,
  Settings,
  Users,
} from "lucide-react";

import { signOutAction } from "@/app/admin/actions";
import { Logo } from "@/components/site/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Match the path exactly — only the dashboard root needs it. */
  exact?: boolean;
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarClock },
  { href: "/admin/services", label: "Services", icon: Scissors },
  { href: "/admin/staff", label: "Barbers", icon: Users },
  { href: "/admin/schedule", label: "Schedule", icon: CalendarRange },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const isActive = useIsActive();

  return (
    <nav className="flex flex-col gap-1" aria-label="Admin">
      {NAV.map((item) => {
        const active = isActive(item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SignOut() {
  return (
    <form action={signOutAction}>
      <Button
        type="submit"
        variant="ghost"
        className="w-full justify-start gap-3 px-3 text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      >
        <LogOut className="size-4" aria-hidden />
        Sign out
      </Button>
    </form>
  );
}

export function AdminSidebar({ email }: { email: string | null }) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-sidebar p-4 lg:flex">
      <div className="px-2 py-3">
        <Logo className="text-sidebar-foreground" href="/admin" />
      </div>

      <div className="mt-6 flex-1">
        <NavLinks />
      </div>

      <div className="border-t border-sidebar-border pt-3">
        {email && (
          <p className="truncate px-3 pb-2 text-xs text-sidebar-foreground/50">
            {email}
          </p>
        )}
        <SignOut />
      </div>
    </aside>
  );
}

export function AdminMobileNav({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 bg-sidebar p-4 text-sidebar-foreground">
        <SheetHeader className="p-0">
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          <div className="px-2 py-2">
            <Logo className="text-sidebar-foreground" href="/admin" />
          </div>
        </SheetHeader>

        <div className="mt-4 flex-1">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>

        <div className="border-t border-sidebar-border pt-3">
          {email && (
            <p className="truncate px-3 pb-2 text-xs text-sidebar-foreground/50">
              {email}
            </p>
          )}
          <SignOut />
        </div>
      </SheetContent>
    </Sheet>
  );
}
