"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";

import { STATUS_ORDER, STATUS_META } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Staff } from "@/lib/database.types";
import { shiftDayKey, todayInShop } from "@/lib/time";

/**
 * Filters live in the URL, not component state — so a filtered view is
 * shareable, survives a refresh, and the server does the filtering.
 */
export function BookingFiltersBar({ staff }: { staff: Staff[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState(params.get("q") ?? "");

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);

    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  // Debounce the free-text search so each keystroke isn't a round trip.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (search === current) return;

    const timer = setTimeout(() => setParam("q", search || null), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const today = todayInShop();
  const hasFilters = ["staff", "status", "from", "to", "q"].some((key) =>
    params.get(key),
  );

  const presets = [
    { label: "Today", from: today, to: today },
    { label: "Next 7 days", from: today, to: shiftDayKey(today, 7) },
    { label: "Past", from: shiftDayKey(today, -60), to: shiftDayKey(today, -1) },
  ];

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1 space-y-1.5">
          <Label htmlFor="booking-search" className="text-xs">
            Search
          </Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="booking-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, phone or BF-code"
              className="pl-9"
            />
            {pending && (
              <Loader2
                className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-hidden
              />
            )}
          </div>
        </div>

        <div className="w-40 space-y-1.5">
          <Label className="text-xs">Barber</Label>
          <Select
            value={params.get("staff") ?? "all"}
            onValueChange={(value) => setParam("staff", value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All barbers</SelectItem>
              {staff.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-40 space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select
            value={params.get("status") ?? "all"}
            onValueChange={(value) => setParam("status", value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {STATUS_ORDER.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_META[status].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="from" className="text-xs">
            From
          </Label>
          <Input
            id="from"
            type="date"
            value={params.get("from") ?? ""}
            onChange={(event) => setParam("from", event.target.value || null)}
            className="w-40"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="to" className="text-xs">
            To
          </Label>
          <Input
            id="to"
            type="date"
            value={params.get("to") ?? ""}
            onChange={(event) => setParam("to", event.target.value || null)}
            className="w-40"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {presets.map((preset) => (
          <Button
            key={preset.label}
            variant="outline"
            size="sm"
            onClick={() => {
              const next = new URLSearchParams(params.toString());
              next.set("from", preset.from);
              next.set("to", preset.to);
              startTransition(() => {
                router.replace(`${pathname}?${next.toString()}`, {
                  scroll: false,
                });
              });
            }}
          >
            {preset.label}
          </Button>
        ))}

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              startTransition(() => router.replace(pathname, { scroll: false }));
            }}
            className="text-muted-foreground"
          >
            <X className="size-3.5" />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
