import type { Metadata } from "next";
import Image from "next/image";
import { Users } from "lucide-react";

import {
  AddStaffButton,
  StaffRowActions,
} from "@/components/admin/staff-editor";
import { Card, CardContent } from "@/components/ui/card";
import {
  getStaffServiceMap,
  listServices,
  listStaff,
} from "@/lib/queries/admin";

export const metadata: Metadata = { title: "Barbers" };

export default async function AdminStaffPage() {
  const [staff, services, serviceMap] = await Promise.all([
    listStaff(),
    listServices(),
    getStaffServiceMap(),
  ]);

  const serviceNames = new Map(services.map((s) => [s.id, s.name]));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold uppercase tracking-wide">
            Barbers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Set who works here and what each of them does.
          </p>
        </div>
        <AddStaffButton services={services} />
      </div>

      <Card>
        <CardContent className="p-0">
          {staff.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <Users className="size-7 text-muted-foreground/60" aria-hidden />
              <p className="font-medium">No barbers yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Add one, assign their services, then set their hours on the
                Schedule page.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {staff.map((member) => {
                const assigned = serviceMap[member.id] ?? [];
                return (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center gap-4 p-4"
                  >
                    <span className="relative size-11 shrink-0 overflow-hidden rounded-full bg-muted">
                      {member.avatar_url && (
                        <Image
                          src={member.avatar_url}
                          alt=""
                          fill
                          sizes="2.75rem"
                          className="object-cover"
                        />
                      )}
                    </span>

                    <div className="min-w-48 flex-1">
                      <p className="font-medium">
                        {member.name}
                        {!member.is_active && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                            Hidden
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                        {assigned.length === 0
                          ? "No services assigned — won't appear when booking"
                          : assigned
                              .map((id) => serviceNames.get(id))
                              .filter(Boolean)
                              .join(", ")}
                      </p>
                    </div>

                    <StaffRowActions
                      staff={member}
                      services={services}
                      serviceIds={assigned}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
