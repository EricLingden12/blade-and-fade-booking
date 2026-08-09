import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function SiteNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-5 py-28 text-center sm:py-40">
      <p className="eyebrow">404</p>
      <h1 className="mt-4 font-display text-4xl font-bold uppercase tracking-tight text-ink-50">
        Nothing here
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-400">
        That page, or that booking reference, doesn&rsquo;t exist. Check the
        link and try again.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button
          asChild
          className="bg-brand-400 font-semibold text-ink-950 hover:bg-brand-300"
        >
          <Link href="/book">Book an appointment</Link>
        </Button>
        <Button
          asChild
          variant="outline"
          className="border-white/20 bg-white/5 hover:bg-white/10"
        >
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
