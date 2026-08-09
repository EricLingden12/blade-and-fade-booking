import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { LoginForm } from "@/components/admin/login-form";
import { Logo } from "@/components/site/logo";
import { SHOP } from "@/lib/shop";

export const metadata: Metadata = { title: "Sign in" };

export default async function AdminLoginPage(props: PageProps<"/admin/login">) {
  const searchParams = await props.searchParams;
  const next = typeof searchParams.next === "string" ? searchParams.next : null;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo className="text-foreground" href="/" />
        </div>

        <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">
            Staff sign in
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {SHOP.fullName} booking dashboard.
          </p>

          <LoginForm next={next} />
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="size-3.5" />
            Back to the site
          </Link>
        </div>
      </div>
    </div>
  );
}
