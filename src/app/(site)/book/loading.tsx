import { Skeleton } from "@/components/ui/skeleton";

export default function BookLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <Skeleton className="h-5 w-48 bg-white/5" />
      <Skeleton className="mt-8 h-10 w-72 bg-white/5" />
      <div className="mt-9 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}
