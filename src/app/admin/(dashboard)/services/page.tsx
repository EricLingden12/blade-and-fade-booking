import type { Metadata } from "next";
import { Scissors } from "lucide-react";

import {
  AddServiceButton,
  ServiceRowActions,
} from "@/components/admin/service-editor";
import { Card, CardContent } from "@/components/ui/card";
import { listServices } from "@/lib/queries/admin";
import { CURRENCY } from "@/lib/shop";
import { formatDuration } from "@/lib/time";

export const metadata: Metadata = { title: "Services" };

export default async function AdminServicesPage() {
  const services = await listServices();

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">
            Services
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hidden services stay bookable for nobody, but keep their history.
          </p>
        </div>
        <AddServiceButton />
      </div>

      <Card>
        <CardContent className="p-0">
          {services.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <Scissors className="size-7 text-muted-foreground/60" aria-hidden />
              <p className="font-medium">No services yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Add your first one and it appears on the public menu straight
                away.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {services.map((service) => (
                <li
                  key={service.id}
                  className="flex flex-wrap items-center gap-4 p-4"
                >
                  <div className="min-w-48 flex-1">
                    <p className="font-medium">
                      {service.name}
                      {!service.is_active && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                          Hidden
                        </span>
                      )}
                    </p>
                    {service.description && (
                      <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                        {service.description}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-right text-sm">
                    <p className="font-medium tabular-nums">
                      {CURRENCY.format(service.price)}
                    </p>
                    <p className="text-muted-foreground">
                      {formatDuration(service.duration_minutes)}
                    </p>
                  </div>

                  <ServiceRowActions service={service} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
