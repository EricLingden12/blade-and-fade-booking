"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteStaffAction,
  saveStaffAction,
  toggleStaffAction,
} from "@/app/admin/(dashboard)/staff/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Service, Staff } from "@/lib/database.types";

type Draft = {
  name: string;
  bio: string;
  avatarUrl: string;
  isActive: boolean;
  sortOrder: string;
  serviceIds: string[];
};

function toDraft(staff?: Staff, serviceIds: string[] = []): Draft {
  return {
    name: staff?.name ?? "",
    bio: staff?.bio ?? "",
    avatarUrl: staff?.avatar_url ?? "",
    isActive: staff?.is_active ?? true,
    sortOrder: String(staff?.sort_order ?? 0),
    serviceIds,
  };
}

export function AddStaffButton({ services }: { services: Service[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add barber
      </Button>
      <StaffDialog open={open} onOpenChange={setOpen} services={services} />
    </>
  );
}

export function StaffRowActions({
  staff,
  services,
  serviceIds,
}: {
  staff: Staff;
  services: Service[];
  serviceIds: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    startTransition(async () => {
      const result = await toggleStaffAction(staff.id, next);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteStaffAction(staff.id);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
      setConfirmingDelete(false);
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <div className="mr-2 flex items-center gap-2">
        <Switch
          checked={staff.is_active}
          onCheckedChange={toggle}
          disabled={pending}
          aria-label={`${staff.name} bookable`}
        />
        <span className="hidden text-xs text-muted-foreground sm:block">
          {staff.is_active ? "Live" : "Hidden"}
        </span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${staff.name}`}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setConfirmingDelete(true)}
        aria-label={`Delete ${staff.name}`}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>

      <StaffDialog
        open={editing}
        onOpenChange={setEditing}
        staff={staff}
        services={services}
        serviceIds={serviceIds}
      />

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {staff.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Their working hours and service assignments go too. If they have
              any bookings this will be blocked — hide them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                remove();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StaffDialog({
  open,
  onOpenChange,
  staff,
  services,
  serviceIds = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff?: Staff;
  services: Service[];
  serviceIds?: string[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(staff, serviceIds));
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) setDraft(toDraft(staff, serviceIds));
    onOpenChange(next);
  }

  function toggleService(id: string, checked: boolean) {
    setDraft((current) => ({
      ...current,
      serviceIds: checked
        ? [...current.serviceIds, id]
        : current.serviceIds.filter((value) => value !== id),
    }));
  }

  function save() {
    startTransition(async () => {
      const result = await saveStaffAction({
        id: staff?.id,
        name: draft.name,
        bio: draft.bio,
        avatarUrl: draft.avatarUrl,
        isActive: draft.isActive,
        sortOrder: Number(draft.sortOrder),
        serviceIds: draft.serviceIds,
      });

      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {staff ? `Edit ${staff.name}` : "Add a barber"}
          </DialogTitle>
          <DialogDescription>
            A barber only appears in the booking flow for services they&rsquo;re
            assigned to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staff-name">Name</Label>
            <Input
              id="staff-name"
              value={draft.name}
              onChange={(event) =>
                setDraft((d) => ({ ...d, name: event.target.value }))
              }
              placeholder="Marcus Reyes"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-bio">Bio</Label>
            <Textarea
              id="staff-bio"
              value={draft.bio}
              onChange={(event) =>
                setDraft((d) => ({ ...d, bio: event.target.value }))
              }
              rows={3}
              maxLength={600}
              className="resize-none"
              placeholder="What they're known for."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="staff-avatar">Photo URL</Label>
            <Input
              id="staff-avatar"
              type="url"
              value={draft.avatarUrl}
              onChange={(event) =>
                setDraft((d) => ({ ...d, avatarUrl: event.target.value }))
              }
              placeholder="https://images.unsplash.com/…"
            />
            <p className="text-xs text-muted-foreground">
              Must be an images.unsplash.com URL, or add the host to
              next.config.ts.
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Services offered</legend>
            {services.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add a service first.
              </p>
            ) : (
              <div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
                {services.map((service) => (
                  <label
                    key={service.id}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <Checkbox
                      checked={draft.serviceIds.includes(service.id)}
                      onCheckedChange={(checked) =>
                        toggleService(service.id, checked === true)
                      }
                    />
                    <span className={service.is_active ? "" : "text-muted-foreground"}>
                      {service.name}
                      {!service.is_active && " (hidden)"}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="flex items-center gap-3">
            <div className="flex flex-1 items-center gap-3 rounded-lg border p-3">
              <Switch
                id="staff-active"
                checked={draft.isActive}
                onCheckedChange={(checked) =>
                  setDraft((d) => ({ ...d, isActive: checked }))
                }
              />
              <Label htmlFor="staff-active" className="font-normal">
                Bookable
              </Label>
            </div>
            <div className="w-24 space-y-2">
              <Label htmlFor="staff-order">Order</Label>
              <Input
                id="staff-order"
                type="number"
                min={0}
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, sortOrder: event.target.value }))
                }
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {staff ? "Save changes" : "Add barber"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
