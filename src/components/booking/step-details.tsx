"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type DetailsDraft = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string;
};

export function StepDetails({
  draft,
  errors,
  onChange,
  onBlurField,
}: {
  draft: DetailsDraft;
  errors: Record<string, string>;
  onChange: (patch: Partial<DetailsDraft>) => void;
  onBlurField: (field: keyof DetailsDraft) => void;
}) {
  return (
    <div className="max-w-xl space-y-6">
      <Field
        id="customerName"
        label="Full name"
        error={errors.customerName}
        required
      >
        <Input
          id="customerName"
          name="name"
          autoComplete="name"
          value={draft.customerName}
          onChange={(event) => onChange({ customerName: event.target.value })}
          onBlur={() => onBlurField("customerName")}
          aria-invalid={Boolean(errors.customerName)}
          aria-describedby={errors.customerName ? "customerName-error" : undefined}
          placeholder="Yusuf Rahman"
          className="h-12 bg-ink-900"
        />
      </Field>

      <Field
        id="customerEmail"
        label="Email"
        hint="Your confirmation and reference code go here."
        error={errors.customerEmail}
        required
      >
        <Input
          id="customerEmail"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={draft.customerEmail}
          onChange={(event) => onChange({ customerEmail: event.target.value })}
          onBlur={() => onBlurField("customerEmail")}
          aria-invalid={Boolean(errors.customerEmail)}
          aria-describedby={
            errors.customerEmail ? "customerEmail-error" : "customerEmail-hint"
          }
          placeholder="you@example.com"
          className="h-12 bg-ink-900"
        />
      </Field>

      <Field
        id="customerPhone"
        label="Mobile"
        hint="Only used if we need to reach you about this appointment."
        error={errors.customerPhone}
        required
      >
        <Input
          id="customerPhone"
          name="tel"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={draft.customerPhone}
          onChange={(event) => onChange({ customerPhone: event.target.value })}
          onBlur={() => onBlurField("customerPhone")}
          aria-invalid={Boolean(errors.customerPhone)}
          aria-describedby={
            errors.customerPhone ? "customerPhone-error" : "customerPhone-hint"
          }
          placeholder="+971 50 123 4567"
          className="h-12 bg-ink-900"
        />
      </Field>

      <Field
        id="notes"
        label="Anything we should know?"
        hint="Optional — a preferred length, an allergy, running late."
        error={errors.notes}
      >
        <Textarea
          id="notes"
          value={draft.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          onBlur={() => onBlurField("notes")}
          aria-invalid={Boolean(errors.notes)}
          aria-describedby={errors.notes ? "notes-error" : "notes-hint"}
          rows={3}
          maxLength={500}
          placeholder="Keep the length on top, tight on the sides."
          className="resize-none bg-ink-900"
        />
      </Field>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-ink-200">
        {label}
        {required && (
          <span className="text-brand-400" aria-hidden>
            *
          </span>
        )}
        {!required && <span className="text-ink-500">(optional)</span>}
      </Label>
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-sm font-medium text-red-400"
        >
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className={cn("text-xs text-ink-500")}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}
