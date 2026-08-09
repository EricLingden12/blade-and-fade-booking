"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteServiceAction,
  saveServiceAction,
  toggleServiceAction,
} from "@/app/admin/(dashboard)/services/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Service } from "@/lib/database.types";

type Draft = {
  name: string;
  description: string;
  durationMinutes: string;
  price: string;
  isActive: boolean;
  sortOrder: string;
};

function toDraft(service?: Service): Draft {
  return {
    name: service?.name ?? "",
    description: service?.description ?? "",
    durationMinutes: String(service?.duration_minutes ?? 30),
    price: String(service?.price ?? 0),
    isActive: service?.is_active ?? true,
    sortOrder: String(service?.sort_order ?? 0),
  };
}

export function AddServiceButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add service
      </Button>
      <ServiceDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function ServiceRowActions({ service }: { service: Service }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    startTransition(async () => {
      const result = await toggleServiceAction(service.id, next);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteServiceAction(service.id);
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
          id={`active-${service.id}`}
          checked={service.is_active}
          onCheckedChange={toggle}
          disabled={pending}
          aria-label={`${service.name} bookable`}
        />
        <Label
          htmlFor={`active-${service.id}`}
          className="hidden text-xs text-muted-foreground sm:block"
        >
          {service.is_active ? "Live" : "Hidden"}
        </Label>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${service.name}`}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setConfirmingDelete(true)}
        aria-label={`Delete ${service.name}`}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>

      <ServiceDialog
        open={editing}
        onOpenChange={setEditing}
        service={service}
      />

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{service.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              If any booking has ever used this service it can&rsquo;t be
              deleted — hide it instead and your history stays intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                remove();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ServiceDialog({
  open,
  onOpenChange,
  service,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(service));
  const [pending, startTransition] = useTransition();

  // Reset the form each time the dialog opens so a cancelled edit doesn't
  // linger into the next one.
  function handleOpenChange(next: boolean) {
    if (next) setDraft(toDraft(service));
    onOpenChange(next);
  }

  function save() {
    startTransition(async () => {
      const result = await saveServiceAction({
        id: service?.id,
        name: draft.name,
        description: draft.description,
        durationMinutes: Number(draft.durationMinutes),
        price: Number(draft.price),
        isActive: draft.isActive,
        sortOrder: Number(draft.sortOrder),
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {service ? `Edit ${service.name}` : "Add a service"}
          </DialogTitle>
          <DialogDescription>
            Duration drives how long the chair is held, in 5-minute steps.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="service-name">Name</Label>
            <Input
              id="service-name"
              value={draft.name}
              onChange={(event) =>
                setDraft((d) => ({ ...d, name: event.target.value }))
              }
              placeholder="Skin Fade"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="service-description">Description</Label>
            <Textarea
              id="service-description"
              value={draft.description}
              onChange={(event) =>
                setDraft((d) => ({ ...d, description: event.target.value }))
              }
              rows={3}
              maxLength={400}
              className="resize-none"
              placeholder="What the customer gets."
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="service-duration">Minutes</Label>
              <Input
                id="service-duration"
                type="number"
                min={5}
                max={480}
                step={5}
                value={draft.durationMinutes}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, durationMinutes: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-price">Price (AED)</Label>
              <Input
                id="service-price"
                type="number"
                min={0}
                step={5}
                value={draft.price}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, price: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-order">Order</Label>
              <Input
                id="service-order"
                type="number"
                min={0}
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, sortOrder: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Switch
              id="service-active"
              checked={draft.isActive}
              onCheckedChange={(checked) =>
                setDraft((d) => ({ ...d, isActive: checked }))
              }
            />
            <Label htmlFor="service-active" className="font-normal">
              Bookable on the public site
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {service ? "Save changes" : "Add service"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
