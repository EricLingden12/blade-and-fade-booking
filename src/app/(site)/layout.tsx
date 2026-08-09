import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Toaster } from "@/components/ui/sonner";

/**
 * Public marketing + booking surface.
 *
 * The `dark` class is what makes shadcn primitives (inputs, cards, calendar)
 * legible here: it swaps the semantic tokens to their dark values for this
 * subtree, so components styled with `bg-card` land on charcoal rather than
 * white. The admin dashboard deliberately omits it and stays light.
 */
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="dark flex min-h-dvh flex-col bg-ink-950 text-ink-100">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <Toaster theme="dark" position="top-center" richColors closeButton />
    </div>
  );
}
