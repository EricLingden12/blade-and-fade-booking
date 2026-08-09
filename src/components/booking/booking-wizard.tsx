"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Loader2, Shuffle, Users } from "lucide-react";
import { toast } from "sonner";

import { createBookingAction } from "@/app/(site)/book/actions";
import { ChoiceCard } from "@/components/booking/choice-card";
import { StepDateTime } from "@/components/booking/step-datetime";
import { StepDetails, type DetailsDraft } from "@/components/booking/step-details";
import { StepIndicator, STEP_LABELS } from "@/components/booking/step-indicator";
import { Button } from "@/components/ui/button";
import type { Service, Staff } from "@/lib/database.types";
import { CURRENCY } from "@/lib/shop";
import {
  formatDateLong,
  formatDuration,
  formatTimeRange,
  type DayKey,
} from "@/lib/time";
import { customerDetailsSchema, fieldErrors } from "@/lib/validation";

const ANY_BARBER = "any";

type Step = 0 | 1 | 2 | 3 | 4;

export function BookingWizard({
  services,
  staff,
  serviceStaff,
  initialServiceId,
  initialStaffId,
}: {
  services: Service[];
  staff: Staff[];
  serviceStaff: Record<string, string[]>;
  initialServiceId: string | null;
  initialStaffId: string | null;
}) {
  const router = useRouter();

  // Deep links from the home page ("book with Omar", "book a skin fade") land
  // the customer on the first step they still have to answer.
  const [step, setStep] = useState<Step>(() => {
    if (initialServiceId && initialStaffId) return 2;
    if (initialServiceId) return 1;
    return 0;
  });

  const [serviceId, setServiceId] = useState<string | null>(initialServiceId);
  const [staffId, setStaffId] = useState<string | null>(initialStaffId);
  const [day, setDay] = useState<DayKey | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [draft, setDraft] = useState<DetailsDraft>({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, startSubmitting] = useTransition();

  const service = services.find((item) => item.id === serviceId) ?? null;
  const barber = staff.find((item) => item.id === staffId) ?? null;

  /** Barbers who can actually perform the chosen service. */
  const eligibleStaff = useMemo(() => {
    if (!serviceId) return [];
    const allowed = new Set(serviceStaff[serviceId] ?? []);
    return staff.filter((item) => allowed.has(item.id));
  }, [serviceId, serviceStaff, staff]);

  const validateDetails = useCallback(
    (values: DetailsDraft, only?: keyof DetailsDraft) => {
      const parsed = customerDetailsSchema.safeParse({
        ...values,
        notes: values.notes || undefined,
      });
      const next = parsed.success ? {} : fieldErrors(parsed.error);

      setErrors((previous) =>
        // Blurring one field shouldn't light up the whole form in red.
        only ? { ...previous, [only]: next[only] ?? "" } : next,
      );
      return parsed.success;
    },
    [],
  );

  const canContinue = (() => {
    switch (step) {
      case 0:
        return Boolean(serviceId);
      case 1:
        // "Any available" (null) is a valid answer, but only if somebody
        // actually offers the chosen service.
        return eligibleStaff.length > 0;
      case 2:
        return Boolean(startsAt);
      case 3:
        return (
          draft.customerName.trim() !== "" &&
          draft.customerEmail.trim() !== "" &&
          draft.customerPhone.trim() !== ""
        );
      default:
        return true;
    }
  })();

  function goNext() {
    if (step === 3 && !validateDetails(draft)) return;
    setStep((current) => Math.min(current + 1, 4) as Step);
  }

  function goBack() {
    setStep((current) => Math.max(current - 1, 0) as Step);
  }

  function submit() {
    if (!serviceId || !startsAt) return;

    startSubmitting(async () => {
      const result = await createBookingAction({
        serviceId,
        staffId,
        startsAt,
        customerName: draft.customerName.trim(),
        customerEmail: draft.customerEmail.trim(),
        customerPhone: draft.customerPhone.trim(),
        notes: draft.notes.trim() || undefined,
      });

      if (result.ok) {
        router.push(`/book/confirmation?ref=${result.referenceCode}`);
        return;
      }

      if (result.reason === "validation") {
        setErrors(result.errors);
        setStep(3);
        toast.error("Please check your details.");
        return;
      }

      // The slot went while they were filling the form. Send them back to the
      // time step with the day intact so re-picking is one tap.
      if (result.reason === "slot_taken" || result.reason === "unavailable") {
        setStartsAt(null);
        setStep(2);
        toast.error(result.message);
        return;
      }

      toast.error(result.message);
    });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <StepIndicator current={step} />

      <div className="mt-8 sm:mt-10">
        <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-tight text-ink-50 sm:text-4xl">
          {step === 0 && "What are you having?"}
          {step === 1 && "Who's cutting?"}
          {step === 2 && "When suits you?"}
          {step === 3 && "Your details"}
          {step === 4 && "Look right?"}
        </h1>

        <div className="mt-7 sm:mt-9">
          {step === 0 && (
            <fieldset>
              <legend className="sr-only">Choose a service</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {services.map((item) => (
                  <ChoiceCard
                    key={item.id}
                    name="service"
                    value={item.id}
                    checked={serviceId === item.id}
                    onSelect={(value) => {
                      setServiceId(value);
                      // A new service can invalidate the barber and the slot.
                      if (staffId && !(serviceStaff[value] ?? []).includes(staffId)) {
                        setStaffId(null);
                      }
                      setStartsAt(null);
                    }}
                    title={item.name}
                    subtitle={item.description}
                    meta={
                      <span className="shrink-0 text-right">
                        <span className="block font-display text-lg font-semibold tabular-nums text-brand-400">
                          {CURRENCY.format(item.price)}
                        </span>
                        <span className="block text-xs text-ink-500">
                          {formatDuration(item.duration_minutes)}
                        </span>
                      </span>
                    }
                  />
                ))}
              </div>
            </fieldset>
          )}

          {step === 1 && (
            <fieldset>
              <legend className="sr-only">Choose a barber</legend>
              {eligibleStaff.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/15 px-6 py-14 text-center">
                  <Users className="mx-auto size-7 text-ink-600" aria-hidden />
                  <p className="mt-3 font-medium text-ink-200">
                    Nobody offers that service right now
                  </p>
                  <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-500">
                    Pick a different service, or call the shop and we&rsquo;ll
                    sort something out.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep(0)}
                    className="mt-5 border-white/20 bg-white/5 hover:bg-white/10"
                  >
                    Choose another service
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3">
                  <ChoiceCard
                    name="barber"
                    value={ANY_BARBER}
                    checked={staffId === null}
                    onSelect={() => {
                      setStaffId(null);
                      setStartsAt(null);
                    }}
                    title="Any available"
                    subtitle="Fastest way in — we'll put you with whoever's free at the time you pick."
                    media={
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-400/12 ring-1 ring-brand-400/25">
                        <Shuffle className="size-5 text-brand-400" aria-hidden />
                      </span>
                    }
                  />

                  {eligibleStaff.map((item) => (
                    <ChoiceCard
                      key={item.id}
                      name="barber"
                      value={item.id}
                      checked={staffId === item.id}
                      onSelect={(value) => {
                        setStaffId(value);
                        setStartsAt(null);
                      }}
                      title={item.name}
                      subtitle={item.bio}
                      media={
                        <span className="relative size-12 shrink-0 overflow-hidden rounded-full bg-ink-800">
                          {item.avatar_url && (
                            <Image
                              src={item.avatar_url}
                              alt=""
                              fill
                              sizes="3rem"
                              className="object-cover"
                            />
                          )}
                        </span>
                      }
                    />
                  ))}
                </div>
              )}
            </fieldset>
          )}

          {step === 2 && serviceId && (
            <StepDateTime
              serviceId={serviceId}
              staffId={staffId}
              day={day}
              startsAt={startsAt}
              onChange={(next) => {
                setDay(next.day);
                setStartsAt(next.startsAt);
              }}
            />
          )}

          {step === 3 && (
            <StepDetails
              draft={draft}
              errors={errors}
              onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
              onBlurField={(field) =>
                validateDetails({ ...draft }, field)
              }
            />
          )}

          {step === 4 && service && startsAt && (
            <Review
              service={service}
              barberName={barber?.name ?? "Any available barber"}
              startsAt={startsAt}
              draft={draft}
              onEdit={(target) => setStep(target)}
            />
          )}
        </div>
      </div>

      {/* Sticky action bar — always in reach on a phone. */}
      <div className="sticky bottom-0 z-10 -mx-5 mt-10 flex items-center gap-3 border-t border-white/10 bg-ink-950/90 px-5 py-4 backdrop-blur-md sm:-mx-8 sm:px-8">
        {step > 0 && (
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={submitting}
            className="h-12 text-ink-300 hover:bg-white/5 hover:text-ink-50"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
        )}

        <div className="ml-auto flex items-center gap-4">
          {service && step > 0 && (
            <p className="hidden text-sm text-ink-400 sm:block">
              {service.name}
              <span className="mx-2 text-ink-600">·</span>
              <span className="font-medium text-ink-100">
                {CURRENCY.format(service.price)}
              </span>
            </p>
          )}

          {step < 4 ? (
            <Button
              onClick={goNext}
              disabled={!canContinue}
              className="h-12 min-w-32 bg-brand-400 px-6 font-semibold text-ink-950 hover:bg-brand-300 disabled:opacity-40"
            >
              Continue
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={submitting}
              className="h-12 min-w-40 bg-brand-400 px-6 font-semibold text-ink-950 hover:bg-brand-300"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Booking…
                </>
              ) : (
                "Confirm booking"
              )}
            </Button>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-ink-600 sm:text-left">
        {STEP_LABELS[step]} · No payment now — you settle up at the shop.
      </p>
    </div>
  );
}

function Review({
  service,
  barberName,
  startsAt,
  draft,
  onEdit,
}: {
  service: Service;
  barberName: string;
  startsAt: string;
  draft: DetailsDraft;
  onEdit: (step: Step) => void;
}) {
  const endsAt = new Date(
    new Date(startsAt).getTime() + service.duration_minutes * 60_000,
  ).toISOString();

  const rows: Array<{ label: string; value: React.ReactNode; step: Step }> = [
    { label: "Service", value: service.name, step: 0 },
    { label: "Barber", value: barberName, step: 1 },
    {
      label: "When",
      value: (
        <>
          {formatDateLong(startsAt)}
          <span className="block text-ink-400">
            {formatTimeRange(startsAt, endsAt)} · {formatDuration(service.duration_minutes)}
          </span>
        </>
      ),
      step: 2,
    },
    {
      label: "You",
      value: (
        <>
          {draft.customerName}
          <span className="block text-ink-400">{draft.customerEmail}</span>
          <span className="block text-ink-400">{draft.customerPhone}</span>
        </>
      ),
      step: 3,
    },
  ];

  if (draft.notes.trim()) {
    rows.push({ label: "Notes", value: draft.notes.trim(), step: 3 });
  }

  return (
    <div className="max-w-2xl overflow-hidden rounded-xl border border-white/12">
      <dl className="divide-y divide-white/10">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-start gap-4 bg-ink-900 px-5 py-4"
          >
            <dt className="w-24 shrink-0 pt-0.5 text-sm text-ink-500">
              {row.label}
            </dt>
            <dd className="min-w-0 flex-1 text-sm font-medium text-ink-50">
              {row.value}
            </dd>
            <button
              type="button"
              onClick={() => onEdit(row.step)}
              className="shrink-0 rounded text-sm font-medium text-brand-400 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-400"
            >
              Edit
              <span className="sr-only"> {row.label.toLowerCase()}</span>
            </button>
          </div>
        ))}

        <div className="flex items-center justify-between gap-4 bg-ink-800 px-5 py-4">
          <dt className="text-sm font-medium text-ink-200">Total due at shop</dt>
          <dd className="font-display text-xl font-semibold tabular-nums text-brand-400">
            {CURRENCY.format(service.price)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
