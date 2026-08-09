import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s · Blade & Fade admin",
  },
  robots: { index: false, follow: false },
};

/** The admin surface stays on the light token set — a tidy, legible dashboard. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="min-h-dvh bg-muted/40 text-foreground">
      {children}
      <Toaster theme="light" position="top-right" richColors closeButton />
    </div>
  );
}
