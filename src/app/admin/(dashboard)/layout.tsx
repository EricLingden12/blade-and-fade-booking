import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, ShieldOff } from "lucide-react";

import { signOutAction } from "@/app/admin/actions";
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

  // Having an account is not the same as being staff. The RLS policies already
  // enforce this — a stranger would simply see empty tables — but an empty
  // dashboard reads as "the app is broken" rather than "you're not allowed in".
  //
  // PGRST202 means the function isn't there, i.e. the allowlist migration
  // hasn't been run yet. That must not lock the owner out of their own
  // dashboard, so it falls back to the older rule: any authenticated user is
  // staff. Every other outcome fails closed.
  const { data: isStaff, error } = await supabase.rpc("is_staff");
  const allowlistInstalled = error?.code !== "PGRST202";

  if (error && allowlistInstalled) {
    console.error("[auth] is_staff check failed:", error.message);
  }
  if (allowlistInstalled && isStaff !== true) {
    return <NotStaff email={user.email ?? null} />;
  }

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

/**
 * Signed in, but not on the staff list.
 *
 * Deliberately says nothing about the shop — no counts, no names, not even
 * whether the dashboard exists in a useful state. Just who they're signed in
 * as, and the way out.
 */
function NotStaff({ email }: { email: string | null }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border p-8 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted">
          <ShieldOff className="size-5 text-muted-foreground" aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-xl font-semibold uppercase tracking-wide">
          Not a staff account
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {email ? (
            <>
              You&rsquo;re signed in as{" "}
              <span className="font-medium text-foreground">{email}</span>, but
              that account isn&rsquo;t on the staff list.
            </>
          ) : (
            <>This account isn&rsquo;t on the staff list.</>
          )}{" "}
          If it should be, the shop owner can add it.
        </p>

        <div className="mt-7 flex flex-col gap-2">
          <form action={signOutAction}>
            <Button type="submit" className="w-full">
              Sign out
            </Button>
          </form>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/">Back to the website</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
