import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { AdminMobileNav, AdminSidebar } from "@/components/admin/admin-nav";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { SHOP_TIMEZONE } from "@/lib/shop";
import { formatInShop, todayInShop } from "@/lib/time";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/admin">) {
  // `proxy.ts` already gates these routes, but a layout that renders admin data
  // shouldn't take that on faith — this is the check that actually guards the
  // queries below it.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  return (
    <div className="flex min-h-dvh">
      <AdminSidebar email={user.email ?? null} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <AdminMobileNav email={user.email ?? null} />

          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {formatInShop(new Date(), "EEEE d MMMM")}
            </span>
            <span className="ml-2 hidden tabular-nums sm:inline">
              {formatInShop(new Date(), "HH:mm")} {SHOP_TIMEZONE}
            </span>
          </p>

          <Button
            asChild
            variant="ghost"
            size="sm"
            className="ml-auto text-muted-foreground"
          >
            <Link href="/" target="_blank">
              <ExternalLink className="size-3.5" />
              <span className="hidden sm:inline">View site</span>
            </Link>
          </Button>
        </header>

        <main className="flex-1 p-4 sm:p-6" data-today={todayInShop()}>
          {children}
        </main>
      </div>
    </div>
  );
}
