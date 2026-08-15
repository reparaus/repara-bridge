import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Camera,
  Check,
  Loader2,
  Pencil,
  ScanLine,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { Field } from "@/components/common/Field";
import { OptionGroup } from "@/components/common/OptionGroup";
import { ProgressStepper } from "@/components/common/ProgressStepper";
import { ServiceCard } from "@/components/common/ServiceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import type { IntakeFollowup, IntakeQuestion } from "@/lib/ai/intake-types";
import { useI18n } from "@/lib/i18n";
import {
  localizedAnswerLabel,
  localizedPhotoPrompt,
  localizedQuestions,
  localizedServiceBlurb,
  localizedServiceLabel,
  localizedVehicleOption,
} from "@/lib/i18n/catalog";
import { requestIntakeQuestions } from "@/lib/intake.functions";
import { quoteRequestSchema } from "@/lib/quote-schema";
import { clearDraft, loadDraft, saveDraft } from "@/lib/quote-storage";
import { discardQuotePhotos, submitQuoteRequest } from "@/lib/quote.functions";
import {
  SERVICES,
  SERVICE_QUESTIONS,
  isServiceKey,
  serviceLabel,
  type ServiceKey,
  type ServiceQuestion,
} from "@/lib/services";
import {
  EMPTY_VEHICLE_CONFIG,
  configSummary,
  drivetrainOptionsFor,
  engineOptionsFor,
  hasDrivetrainInfo,
  hasEngineInfo,
  type Drivetrain,
  type VehicleConfig,
} from "@/lib/vehicle-config";
import { decodeVin, isCompleteVin, isVinScanSupported, maskVin, normalizeVin, validateVin } from "@/lib/vin";
import { VinScanner } from "@/components/quote/VinScanner";

export const Route = createFileRoute("/quote/")({
  /**
   * Optional `?service=<ServiceKey>` deep link. Used by the homepage service
   * cards to preselect a category in the existing flow. Unknown values are
   * ignored so the flow behaves exactly as before.
   */
  validateSearch: (search: Record<string, unknown>): { service?: ServiceKey } => {
    const raw = typeof search.service === "string" ? search.service : undefined;
    return raw && isServiceKey(raw) ? { service: raw } : {};
  },
  head: () => ({
    meta: [
      { title: "Get a Quote — Repara" },
      {
        name: "description",
        content:
          "Tell us what you drive and what your vehicle needs. Repara sends a personalized, itemized quote — no account required.",
      },
      { property: "og:title", content: "Get a Quote — Repara" },
      {
        property: "og:description",
        content: "Request a personalized mobile automotive service quote in under a minute.",
      },
    ],
  }),
  component: QuoteFlow,
});

/** Step indexes. The AI follow-up step (3) is skipped when there are no questions. */
const STEP_VEHICLE = 0;
const STEP_SERVICE = 1;
const STEP_DETAILS = 2;
const STEP_QUESTIONS = 3;
const STEP_CONTACT = 4;
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

type AnswerValue = string | string[];

type DecodedVehicleState = { year: number; make: string; model: string; trim?: string } | null;

type FormState = {
  /** "vin" = identified by VIN decode, "manual" = year/make/model entry. */
  vehicleMode: "vin" | "manual";
  vin: string;
  decoded: DecodedVehicleState;
  year: string;
  make: string;
  model: string;
  /** Structured engine/drivetrain configuration, sourced from VIN or customer. */
  config: VehicleConfig;
  /** Selected engine option id, when the customer had to answer the fallback. */
  engineChoice: string;
  services: string[];
  answers: Record<string, Record<string, AnswerValue>>;
  mileage: string;
  zipCode: string;
  notes: string;
  /** Files stay in browser memory until final submission. */
  photos: File[];
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  contactMethod: string;
  /**
   * Idempotency key for THIS submission attempt. Persisted with the draft so a
   * refresh or retry reuses it; a new quote gets a new key, so returning
   * customers can always submit again.
   */
  submissionId: string;
  /** AI-assisted intake follow-ups: the questions asked and what was answered. */
  intakeQuestions: IntakeQuestion[];
  intakeAnswers: Record<string, string>;
};

const EMPTY: FormState = {
  vehicleMode: "vin",
  vin: "",
  decoded: null,
  year: "",
  make: "",
  model: "",
  config: EMPTY_VEHICLE_CONFIG,
  engineChoice: "",
  services: [],
  answers: {},
  mileage: "",
  zipCode: "",
  notes: "",
  photos: [],
  firstName: "",
  lastName: "",
  phone: "",
  email: "",

  contactMethod: "text",
  submissionId: "",
  intakeQuestions: [],
  intakeAnswers: {},
};

/** Uploads locally held photos at submission time and returns storage paths. */
async function uploadQuotePhotos(photos: File[]): Promise<string[]> {
  if (photos.length === 0) return [];
  const folder = crypto.randomUUID();
  const paths: string[] = [];
  for (const file of photos) {
    const path = `${folder}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("request-photos").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    // A photo failure must never void an otherwise valid request.
    if (!error) paths.push(path);
  }
  return paths;
}

function vehicleTitle(form: FormState) {
  if (form.vehicleMode === "vin" && form.decoded) {
    const { year, make, model, trim } = form.decoded;
    return `${year} ${make} ${model}${trim ? ` ${trim}` : ""}`.trim();
  }
  return `${form.year} ${form.make} ${form.model}`.trim();
}

function formatMiles(value: string) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : value;
}

function QuoteFlow() {
  const { t, lang } = useI18n();
  const submit = useServerFn(submitQuoteRequest);
  const discardPhotos = useServerFn(discardQuotePhotos);
  const askIntakeQuestions = useServerFn(requestIntakeQuestions);
  const { service: preselectedService } = Route.useSearch();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  /** True only while the AI is preparing intake follow-ups. */
  const [preparing, setPreparing] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    requestNumber: string;
    snapshot: FormState;
    outsideArea: boolean;
  } | null>(
    null,
  );

  useEffect(() => {
    const draft = loadDraft();
    if (draft?.data) {
      setForm((f) => ({ ...f, ...(draft.data as Partial<FormState>) }));
      setStep(Math.min(draft.step ?? 0, STEP_CONTACT));
    }
    if (preselectedService) {
      setForm((f) =>
        f.services.includes(preselectedService)
          ? f
          : { ...f, services: [...f.services, preselectedService] },
      );
    }
    // One idempotency key per quote attempt, reused across retries.
    setForm((f) => (f.submissionId ? f : { ...f, submissionId: crypto.randomUUID() }));
    setHydrated(true);
    track("quote_started");
  }, [preselectedService]);

  useEffect(() => {
    if (!hydrated || confirmation) return;
    // Photos are File objects — never serialized, never uploaded before submit.
    const { photos: _photos, ...serializable } = form;
    saveDraft({ step, data: serializable as unknown as Record<string, unknown> });
  }, [form, step, hydrated, confirmation]);

  function patch(next: Partial<FormState>) {
    setForm((f) => ({ ...f, ...next }));
  }

  const payload = useMemo(
    () => ({
      vehicle: {
        entryMethod: form.vehicleMode,
        vin: form.vehicleMode === "vin" && form.vin ? normalizeVin(form.vin) : "",
        year: form.vehicleMode === "vin" && form.decoded ? form.decoded.year : form.year,
        make: form.vehicleMode === "vin" && form.decoded ? form.decoded.make : form.make,
        model: form.vehicleMode === "vin" && form.decoded ? form.decoded.model : form.model,
        trim: form.vehicleMode === "vin" ? (form.decoded?.trim ?? "") : "",
        engineDisplacement: form.config.engineDisplacement,
        engineCode: form.config.engineCode ?? "",
        cylinderCount: form.config.cylinderCount,
        fuelType: form.config.fuelType ?? "",
        isHybrid: form.config.isHybrid,
        drivetrain: form.config.drivetrain,
        bodyType: form.config.bodyType ?? "",
        engineSource: form.config.engineSource,
        drivetrainSource: form.config.drivetrainSource,
      },

      services: form.services.map((key) => ({
        key,
        label: serviceLabel(key),
        answers: form.answers[key] ?? {},
      })),
      details: {
        mileage: form.mileage,
        zipCode: form.zipCode,
        notes: form.notes,
        photoPaths: [] as string[],
      },
      submissionId: form.submissionId || undefined,
      preferredLanguage: lang,
      intakeFollowups: collectFollowups(form),
      contact: {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        email: form.email,
        preferredContactMethod: form.contactMethod,
      },
    }),
    [form, lang],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      // Nothing has touched the database up to this point. Photos are uploaded
      // now, as part of submission, and removed again if submission fails.
      const uploadedPaths = await uploadQuotePhotos(form.photos);
      try {
        return await submit({
          data: quoteRequestSchema.parse({
            ...payload,
            details: { ...payload.details, photoPaths: uploadedPaths },
          }),
        });
      } catch (error) {
        if (uploadedPaths.length) {
          void discardPhotos({ data: { paths: uploadedPaths } }).catch(() => {});
        }
        throw error;
      }
    },
    onSuccess: (result) => {
      track("quote_submitted", {
        request_number: result.requestNumber,
        services: form.services.join(","),
      });
      clearDraft();
      setConfirmation({
        requestNumber: result.requestNumber,
        snapshot: form,
        outsideArea: result.serviceAreaStatus === "outside_area",
      });
      window.scrollTo({ top: 0 });
    },
    onError: () => {
      toast.error(t("quote.submitFailed"));
    },
  });

  function validateStep(): boolean {
    const e: Record<string, string> = {};

    if (step === 0) {
      if (form.vehicleMode === "vin") {
        if (!form.decoded) {
          e.vin = isCompleteVin(form.vin)
            ? t("quote.vehicle.errVinDecode")
            : t("quote.vehicle.errVinShort");
        }
      } else {
        if (!/^\d{4}$/.test(form.year)) e.year = t("quote.vehicle.errYear");
        if (!form.make.trim()) e.make = t("quote.vehicle.errMake");
        if (!form.model.trim()) e.model = t("quote.vehicle.errModel");
      }
    }

    if (step === 1) {
      if (form.services.length === 0) e.services = t("quote.service.errSelect");
      for (const key of form.services) {
        for (const q of SERVICE_QUESTIONS[key as ServiceKey] ?? []) {
          if (!q.required) continue;
          const value = form.answers[key]?.[q.id];
          const empty = Array.isArray(value) ? value.length === 0 : !String(value ?? "").trim();
          if (empty) e[`${key}.${q.id}`] = t("quote.service.errAnswer");
        }
      }
    }

    if (step === 2) {
      const miles = Number(form.mileage);
      if (!form.mileage.trim() || !Number.isFinite(miles) || miles < 0 || miles > 2_000_000)
        e.mileage = t("quote.details.errMileage");
      if (!/^\d{5}(-\d{4})?$/.test(form.zipCode.trim())) e.zipCode = t("quote.details.errZip");
    }

    if (step === STEP_CONTACT) {
      if (!form.firstName.trim()) e.firstName = t("quote.contact.errFirst");
      const needsPhone = form.contactMethod === "text" || form.contactMethod === "call";
      const phoneOk = /^[0-9+()\-.\s]{7,20}$/.test(form.phone.trim());
      if (needsPhone && !phoneOk) e.phone = t("quote.contact.errPhone");
      if (!needsPhone && form.phone.trim() && !phoneOk)
        e.phone = t("quote.contact.errPhoneInvalid");
      const emailOk = /^\S+@\S+\.\S+$/.test(form.email.trim());
      if (form.contactMethod === "email" && !emailOk)
        e.email = t("quote.contact.errEmail");
      if (form.contactMethod !== "email" && form.email.trim() && !emailOk)
        e.email = t("quote.contact.errEmailInvalid");
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function goTo(nextStep: number) {
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * Asks the AI for 1–3 clarifying questions about what the customer described.
   * Any failure (or nothing worth asking) simply skips the step — AI is never
   * allowed to block a submission.
   */
  async function loadIntakeQuestions() {
    setPreparing(true);
    try {
      const result = await askIntakeQuestions({
        data: {
          language: lang,
          vehicle: {
            year: form.vehicleMode === "vin" ? form.decoded?.year : form.year,
            make: form.vehicleMode === "vin" ? form.decoded?.make : form.make,
            model: form.vehicleMode === "vin" ? form.decoded?.model : form.model,
            trim: form.decoded?.trim ?? "",
            engine: configSummary(form.config) || undefined,
            drivetrain: form.config.drivetrain,
            hasVin: form.vehicleMode === "vin",
          },
          mileage: form.mileage,
          services: form.services.map((key) => ({
            label: serviceLabel(key),
            answers: Object.entries(form.answers[key] ?? {}).flatMap(([qid, v]) =>
              (Array.isArray(v) ? v : [String(v)])
                .filter(Boolean)
                .map((x) => `${qid}: ${answerText(key, qid, x)}`),
            ),
          })),
          notes: form.notes || undefined,
        },
      });
      return result.questions;
    } catch {
      return [] as IntakeQuestion[];
    } finally {
      setPreparing(false);
    }
  }

  async function next() {
    if (!validateStep()) return;
    if (step === STEP_VEHICLE) {
      track("vehicle_added", { method: form.vehicleMode });
      track("vehicle_completed", { method: form.vehicleMode });
    }
    if (step === STEP_SERVICE) track("service_selected", { services: form.services.join(",") });
    if (step === STEP_DETAILS) {
      track("quote_form_completed");
      track("details_completed");

      const questions = form.intakeQuestions.length
        ? form.intakeQuestions
        : await loadIntakeQuestions();
      if (questions.length) {
        patch({ intakeQuestions: questions });
        track("intake_questions_shown", { count: questions.length });
        goTo(STEP_QUESTIONS);
        return;
      }
      track("contact_started");
      goTo(STEP_CONTACT);
      return;
    }
    if (step === STEP_QUESTIONS) {
      track("intake_questions_answered", {
        answered: String(
          form.intakeQuestions.filter((q) => (form.intakeAnswers[q.id] ?? "").trim()).length,
        ),
      });
      track("contact_started");
      goTo(STEP_CONTACT);
      return;
    }
    goTo(Math.min(step + 1, STEP_CONTACT));
  }

  function back() {
    setErrors({});
    // Skip the AI step on the way back when there was nothing to ask.
    const previous =
      step === STEP_CONTACT && form.intakeQuestions.length === 0 ? STEP_DETAILS : step - 1;
    goTo(Math.max(previous, STEP_VEHICLE));
  }

  // The AI step only appears in the stepper once there is something to ask.
  const showQuestionsStep = form.intakeQuestions.length > 0 || step === STEP_QUESTIONS;
  const stepLabels = [
    t("quote.steps.vehicle"),
    t("quote.steps.service"),
    t("quote.steps.details"),
    ...(showQuestionsStep ? [t("quote.steps.questions")] : []),
    t("quote.steps.contact"),
  ];
  const stepperIndex = showQuestionsStep ? step : Math.min(step, 3);

  if (confirmation) {
    return (
      <Confirmation
        requestNumber={confirmation.requestNumber}
        outsideArea={confirmation.outsideArea}
        snapshot={confirmation.snapshot}
        onAnother={() => {
          // Fresh idempotency key: a new request is always allowed.
          setForm({ ...EMPTY, submissionId: crypto.randomUUID() });
          setStep(0);
          setErrors({});
          setConfirmation(null);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-5">
          {step === STEP_VEHICLE ? (
            <Link
              to="/"
              aria-label={t("nav.backToRepara")}
              className="-m-2 p-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-5" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={back}
              aria-label={t("common.back")}
              className="-m-2 p-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}
          <Logo compact />
          <LanguageToggle />
        </div>
        <div className="mx-auto max-w-2xl px-5 pb-4">
          <ProgressStepper steps={stepLabels} current={stepperIndex} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 pb-36">
        <div key={`${step}-${lang}`} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          {step === STEP_VEHICLE && <VehicleStep form={form} patch={patch} errors={errors} />}
          {step === STEP_SERVICE && <ServiceStep form={form} patch={patch} errors={errors} />}
          {step === STEP_DETAILS && <DetailsStep form={form} patch={patch} errors={errors} />}
          {step === STEP_QUESTIONS && <FollowupsStep form={form} patch={patch} />}
          {step === STEP_CONTACT && <ContactStep form={form} patch={patch} errors={errors} />}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <div className="mx-auto max-w-2xl px-5 py-4">
          {step === STEP_CONTACT && (
            <p className="mb-3 text-center text-[11px] leading-relaxed text-muted-foreground">
              {t("quote.consent")}
            </p>
          )}
          <Button
            size="lg"
            className="h-13 w-full rounded-full text-sm tracking-[0.12em]"
            disabled={mutation.isPending || preparing}
            onClick={() => {
              if (step < STEP_CONTACT) return void next();
              if (validateStep()) mutation.mutate();
            }}
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> {t("quote.submitting")}
              </>
            ) : preparing ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" /> {t("quote.preparing")}
              </>
            ) : step < STEP_CONTACT ? (
              t("quote.continue")
            ) : (
              t("quote.submit")
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ shared pieces ------------------------------ */

function InspectionNote() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-chrome/30 bg-accent/60 p-4">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-chrome" />
      <div>
        <p className="text-sm font-medium">{INSPECTION_TITLE}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{INSPECTION_BODY}</p>
      </div>
    </div>
  );
}

/* ---------------------------------- STEP 1 --------------------------------- */

function VehicleStep({
  form,
  patch,
  errors,
}: {
  form: FormState;
  patch: (n: Partial<FormState>) => void;
  errors: Record<string, string>;
}) {
  const [decoding, setDecoding] = useState(false);
  const [vinMessage, setVinMessage] = useState<string | null>(null);
  const attempted = useRef<string | null>(null);
  // Capability is resolved after hydration — the server can't know.
  const [scanSupported, setScanSupported] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  useEffect(() => setScanSupported(isVinScanSupported()), []);

  async function runDecode(vin: string) {
    const check = validateVin(vin);
    if (!check.valid) {
      setVinMessage(check.message!);
      return;
    }
    attempted.current = vin;
    setDecoding(true);
    setVinMessage(null);
    track("vin_entered");
    const result = await decodeVin(vin);
    setDecoding(false);
    if (result.status === "decoded") {
      track("vin_decoded");
      const v = result.vehicle;
      patch({
        decoded: {
          year: v.year ?? 0,
          make: v.make ?? "",
          model: v.model ?? "",
          trim: v.trim,
        },
        // Anything the VIN answered confidently is never asked again.
        config: {
          trim: v.trim,
          engineDisplacement: v.engineDisplacement,
          engineCode: v.engineCode,
          cylinderCount: v.cylinderCount,
          fuelType: v.fuelType,
          isHybrid: v.isHybrid,
          drivetrain: v.drivetrain ?? "unknown",
          bodyType: v.bodyType,
          engineSource: v.engineDisplacement || v.cylinderCount ? "vin" : undefined,
          drivetrainSource: v.drivetrain && v.drivetrain !== "unknown" ? "vin" : undefined,
        },
        engineChoice: "",
      });
    } else {
      patch({ decoded: null, config: EMPTY_VEHICLE_CONFIG, engineChoice: "" });
      setVinMessage(result.message);
    }

  }

  // Auto-decode as soon as a complete VIN is present — no button press needed.
  useEffect(() => {
    if (form.vehicleMode !== "vin") return;
    if (form.decoded || decoding) return;
    if (!isCompleteVin(form.vin)) return;
    if (attempted.current === form.vin) return;
    void runDecode(form.vin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.vin, form.vehicleMode, form.decoded, decoding]);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-3xl font-extrabold">What do you drive?</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your VIN is the fastest way — we'll pull your year, make and model automatically.
        </p>
      </div>

      {form.vehicleMode === "vin" ? (
        <>
          <section className="surface-panel space-y-4 p-5">
            <Field
              label="VIN"
              htmlFor="vin"
              error={errors.vin ?? vinMessage}
              hint="17 characters — dashboard, door jamb, or your insurance card."
            >
              <Input
                id="vin"
                value={form.vin}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="1HGCM82633A004352"
                maxLength={17}
                onChange={(e) => {
                  patch({ vin: normalizeVin(e.target.value), decoded: null });
                  setVinMessage(null);
                }}
                className="h-12 font-mono tracking-[0.12em]"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              {/* Fallback for the automatic decode above. */}
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl border-border bg-transparent"
                onClick={() => void runDecode(form.vin)}
                disabled={decoding}
              >
                {decoding ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                {decoding ? "DECODING" : "DECODE VIN"}
              </Button>
              {/* Camera scan: decoding happens on-device, nothing is uploaded. */}
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl border-border bg-transparent"
                onClick={() => {
                  if (!scanSupported) {
                    toast("Camera scanning isn't available. Enter your VIN manually instead.");
                    return;
                  }
                  setVinMessage(null);
                  setScannerOpen(true);
                }}
              >
                <ScanLine className="mr-2 size-4" /> SCAN VIN
              </Button>
            </div>

            {scannerOpen && (
              <VinScanner
                onDetected={(vin) => {
                  setScannerOpen(false);
                  const clean = normalizeVin(vin);
                  patch({ vin: clean, decoded: null });
                  // The auto-decode effect picks a valid VIN up immediately.
                  const check = validateVin(clean);
                  if (!check.valid) setVinMessage(check.message!);
                }}
                onClose={(reason) => {
                  setScannerOpen(false);
                  if (reason === "unavailable")
                    toast("Camera scanning isn't available. Enter your VIN manually instead.");
                }}
              />
            )}

            {form.decoded && (
              <div className="rounded-xl border border-chrome/40 bg-accent p-4">
                <p className="text-[11px] tracking-[0.2em] text-chrome uppercase">Vehicle found</p>
                <p className="mt-1 font-display text-lg font-semibold">{vehicleTitle(form)}</p>
                {configSummary(form.config) && (
                  <p className="mt-1 text-xs text-muted-foreground">{configSummary(form.config)}</p>
                )}
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  VIN {maskVin(form.vin)}
                </p>
              </div>
            )}

          </section>

          <button
            type="button"
            onClick={() =>
              patch({
                vehicleMode: "manual",
                year: form.decoded ? String(form.decoded.year) : form.year,
                make: form.decoded?.make ?? form.make,
                model: form.decoded?.model ?? form.model,
              })
            }
            className="mx-auto flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            <Pencil className="size-3.5" /> Enter vehicle details instead
          </button>
        </>
      ) : (
        <>
          <section className="surface-panel space-y-4 p-5">
            <Field label="Year" htmlFor="year" error={errors.year}>
              <Input
                id="year"
                value={form.year}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="2021"
                maxLength={4}
                onChange={(e) => patch({ year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                className="h-12"
              />
            </Field>
            <Field label="Make" htmlFor="make" error={errors.make}>
              <Input
                id="make"
                value={form.make}
                placeholder="Lexus"
                autoComplete="off"
                autoCapitalize="words"
                onChange={(e) => patch({ make: e.target.value })}
                className="h-12"
              />
            </Field>
            <Field label="Model" htmlFor="model" error={errors.model}>
              <Input
                id="model"
                value={form.model}
                placeholder="RX 350"
                autoComplete="off"
                autoCapitalize="words"
                onChange={(e) => patch({ model: e.target.value })}
                className="h-12"
              />
            </Field>
          </section>

          <button
            type="button"
            onClick={() => patch({ vehicleMode: "vin" })}
            className="mx-auto flex min-h-[44px] items-center gap-2 text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            <ScanLine className="size-3.5" /> Use my VIN instead
          </button>
        </>
      )}

      <VehicleConfigFallback form={form} patch={patch} />
    </div>
  );
}

/**
 * Only asks what the VIN didn't answer. Every question offers "Not sure", and
 * the answer is stored as structured data with `source = "customer"`.
 */
function VehicleConfigFallback({
  form,
  patch,
}: {
  form: FormState;
  patch: (n: Partial<FormState>) => void;
}) {
  const identified =
    form.vehicleMode === "vin"
      ? Boolean(form.decoded)
      : Boolean(form.year && form.make.trim() && form.model.trim());
  if (!identified) return null;

  const year = form.vehicleMode === "vin" ? form.decoded?.year : Number(form.year);
  const make = form.vehicleMode === "vin" ? (form.decoded?.make ?? "") : form.make;
  const model = form.vehicleMode === "vin" ? (form.decoded?.model ?? "") : form.model;

  const needsEngine = !hasEngineInfo(form.config);
  const needsDrivetrain = !hasDrivetrainInfo(form.config);
  if (!needsEngine && !needsDrivetrain) return null;

  const engines = engineOptionsFor(make, model, year);
  const drivetrain = drivetrainOptionsFor(make, model, form.config.bodyType);

  function chooseEngine(id: string) {
    const option = engines.options.find((o) => o.id === id);
    if (!option) return;
    patch({
      engineChoice: id,
      config: {
        ...form.config,
        engineDisplacement: option.displacement,
        cylinderCount: option.cylinders,
        isHybrid: option.isHybrid ?? form.config.isHybrid,
        fuelType: option.isHybrid ? "hybrid" : form.config.fuelType,
        engineSource: id === "not-sure" ? undefined : "customer",
      },
    });
  }

  function chooseDrivetrain(value: string) {
    const next = value as Drivetrain;
    patch({
      config: {
        ...form.config,
        drivetrain: next,
        drivetrainSource: "customer",
      },
    });
  }

  return (
    <section className="surface-panel space-y-6 p-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        A couple of quick details so your parts, fluids and labor are quoted accurately.
      </p>

      {needsEngine && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium">
            {engines.specific && make && model
              ? `Which engine is in your ${year ? `${year} ` : ""}${make} ${model}?`
              : "Which engine does your vehicle have?"}
          </h2>
          <OptionGroup
            columns={1}
            value={form.engineChoice ? [form.engineChoice] : []}
            onChange={(next) => chooseEngine(next[0] ?? "")}
            options={engines.options.map((o) => ({ value: o.id, label: o.label }))}
          />
        </div>
      )}

      {needsDrivetrain && drivetrain && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium">{drivetrain.question}</h2>
          <OptionGroup
            columns={1}
            value={form.config.drivetrainSource === "customer" ? [form.config.drivetrain] : []}
            onChange={(next) => chooseDrivetrain(next[0] ?? "unknown")}
            options={drivetrain.options.map((o) => ({ value: o.value, label: o.label }))}
          />
        </div>
      )}
    </section>
  );
}


/* ---------------------------------- STEP 2 --------------------------------- */

function ServiceStep({
  form,
  patch,
  errors,
}: {
  form: FormState;
  patch: (n: Partial<FormState>) => void;
  errors: Record<string, string>;
}) {
  function toggleService(key: string) {
    const selected = form.services.includes(key);
    const services = selected ? form.services.filter((k) => k !== key) : [...form.services, key];
    const answers = { ...form.answers };
    if (selected) delete answers[key];
    patch({ services, answers });
  }

  function setAnswer(serviceKey: string, questionId: string, value: AnswerValue) {
    patch({
      answers: {
        ...form.answers,
        [serviceKey]: { ...(form.answers[serviceKey] ?? {}), [questionId]: value },
      },
    });
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-3xl font-extrabold">What does your vehicle need?</h1>
        <p className="mt-2 text-sm text-muted-foreground">Select all that apply.</p>
        {errors.services && <p className="mt-2 text-sm text-destructive">{errors.services}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {SERVICES.map((s) => (
          <ServiceCard
            key={s.key}
            label={s.label}
            blurb={s.blurb}
            selected={form.services.includes(s.key)}
            onSelect={() => toggleService(s.key)}
          />
        ))}
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{MOBILE_SCOPE_NOTE}</p>

      {form.services.map((key) => {
        const questions = SERVICE_QUESTIONS[key as ServiceKey] ?? [];
        if (questions.length === 0) return null;
        return (
          <section key={key} className="surface-panel space-y-5 p-5">
            <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
              {serviceLabel(key)}
            </p>
            {questions.map((q) => (
              <QuestionField
                key={q.id}
                serviceKey={key}
                question={q}
                value={form.answers[key]?.[q.id]}
                error={errors[`${key}.${q.id}`]}
                onChange={(v) => setAnswer(key, q.id, v)}
              />
            ))}
          </section>
        );
      })}

      {form.services.length > 0 && <InspectionNote />}
    </div>
  );
}

function QuestionField({
  serviceKey,
  question,
  value,
  error,
  onChange,
}: {
  serviceKey: string;
  question: ServiceQuestion;
  value: AnswerValue | undefined;
  error?: string;
  onChange: (value: AnswerValue) => void;
}) {
  const id = `${serviceKey}-${question.id}`;
  const asArray = Array.isArray(value) ? value : value ? [String(value)] : [];

  if (question.kind === "single" || question.kind === "multi") {
    return (
      <Field
        label={question.label}
        hint={question.hint}
        error={error}
      >
        <OptionGroup
          multiple={question.kind === "multi"}
          options={question.options ?? []}
          value={asArray}
          columns={question.columns ?? 2}
          onChange={(next) => onChange(question.kind === "multi" ? next : (next[0] ?? ""))}
        />
      </Field>
    );
  }

  if (question.kind === "textarea") {
    return (
      <Field label={question.label} htmlFor={id} error={error} optional={!question.required}>
        <Textarea
          id={id}
          rows={4}
          value={typeof value === "string" ? value : ""}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    );
  }

  return (
    <Field label={question.label} htmlFor={id} error={error} optional={!question.required}>
      <Input
        id={id}
        value={typeof value === "string" ? value : ""}
        placeholder={question.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-12"
      />
    </Field>
  );
}

/* ---------------------------------- STEP 3 --------------------------------- */

function DetailsStep({
  form,
  patch,
  errors,
}: {
  form: FormState;
  patch: (n: Partial<FormState>) => void;
  errors: Record<string, string>;
}) {
  const photoPrompt =
    form.services.map((k) => PHOTO_PROMPTS[k as ServiceKey]).find(Boolean) ??
    "Warning lights, leaks, tires, damaged parts — anything you'd like us to see.";

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const remaining = MAX_PHOTOS - form.photos.length;
    const selected = Array.from(files).slice(0, remaining);
    if (selected.length === 0) {
      toast.error(`You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }

    // Files are held in browser memory and only uploaded on final submission.
    const accepted: File[] = [];
    for (const file of selected) {
      if (!file.type.startsWith("image/")) {
        toast.error("Photos only for now — please upload an image.");
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        toast.error(`${file.name} is too large. Keep photos under 8 MB.`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length) patch({ photos: [...form.photos, ...accepted] });
  }


  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-3xl font-extrabold">A few more details</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This helps us quote accurately the first time.
        </p>
      </div>

      <Field
        label="Current mileage"
        htmlFor="mileage"
        error={errors.mileage}
        hint="We record mileage at each visit to keep your vehicle's service history accurate."
      >
        <Input
          id="mileage"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={form.mileage ? formatMiles(form.mileage) : ""}
          placeholder="48,214"
          onChange={(e) => patch({ mileage: e.target.value.replace(/\D/g, "").slice(0, 7) })}
          className="h-12"
        />
      </Field>

      <Field
        label="ZIP code"
        htmlFor="zip"
        error={errors.zipCode}
        hint="We come to you — ZIP code lets us confirm you're in our service area. You'll provide the exact service address when scheduling."
      >
        <Input
          id="zip"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="postal-code"
          value={form.zipCode}
          placeholder="30301"
          maxLength={10}
          onChange={(e) => patch({ zipCode: e.target.value })}
          className="h-12"
        />
      </Field>

      <Field label="Anything else we should know?" optional htmlFor="notes">
        <Textarea
          id="notes"
          rows={4}
          value={form.notes}
          placeholder="Timing, previous work, symptoms, anything else that may help…"
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </Field>

      <Field label="Photos" optional hint={photoPrompt}>
        <div className="space-y-3">
          <label className="flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface px-4 py-6 text-center transition-colors hover:border-chrome/50">
            <input
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Camera className="size-5 text-chrome" />
            <span className="text-sm text-muted-foreground">Take or choose photos</span>
          </label>

          {form.photos.length > 0 && (
            <ul className="space-y-2">
              {form.photos.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <Upload className="size-4 shrink-0 text-chrome" />
                    <span className="truncate">{file.name}</span>
                  </span>
                  <button
                    type="button"
                    aria-label="Remove photo"
                    className="-m-2 p-2 text-muted-foreground hover:text-foreground"
                    onClick={() => patch({ photos: form.photos.filter((_, i) => i !== index) })}
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

        </div>
      </Field>

      <InspectionNote />
    </div>
  );
}

/* ---------------------------------- STEP 4 --------------------------------- */

function ContactStep({
  form,
  patch,
  errors,
}: {
  form: FormState;
  patch: (n: Partial<FormState>) => void;
  errors: Record<string, string>;
}) {
  const emailRequired = form.contactMethod === "email";
  const phoneRequired = form.contactMethod === "text" || form.contactMethod === "call";

  return (
    <div className="space-y-7">
      <div>
        <h1 className="font-display text-3xl font-extrabold">Where should we send your quote?</h1>
        <p className="mt-2 text-sm text-muted-foreground">No account needed.</p>
      </div>

      <Field label="Preferred contact method">
        <OptionGroup
          options={CONTACT_METHODS}
          value={[form.contactMethod]}
          onChange={(v) => patch({ contactMethod: v[0] ?? "text" })}
        />
      </Field>

      <Field label="First name" htmlFor="first" error={errors.firstName}>
        <Input
          id="first"
          value={form.firstName}
          autoComplete="given-name"
          onChange={(e) => patch({ firstName: e.target.value })}
          className="h-12"
        />
      </Field>

      <Field label="Last name" htmlFor="last" optional>
        <Input
          id="last"
          value={form.lastName}
          autoComplete="family-name"
          onChange={(e) => patch({ lastName: e.target.value })}
          className="h-12"
        />
      </Field>

      <Field label="Mobile phone" htmlFor="phone" optional={!phoneRequired} error={errors.phone}>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={form.phone}
          placeholder="(555) 123-4567"
          onChange={(e) => patch({ phone: e.target.value })}
          className="h-12"
        />
      </Field>

      <Field label="Email" htmlFor="email" optional={!emailRequired} error={errors.email}>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={form.email}
          placeholder="you@email.com"
          onChange={(e) => patch({ email: e.target.value })}
          className="h-12"
        />
      </Field>
    </div>
  );
}

/* ------------------------------- CONFIRMATION ------------------------------ */

function Confirmation({
  requestNumber,
  snapshot,
  outsideArea = false,
  onAnother,
}: {
  requestNumber: string;
  snapshot: FormState;
  outsideArea?: boolean;
  onAnother: () => void;
}) {
  const contactLabel =
    CONTACT_METHODS.find((c) => c.value === snapshot.contactMethod)?.label ?? "Text";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-16">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full border border-chrome/40 bg-accent">
          <Check className="size-6 text-chrome" />
        </span>
        <h1 className="mt-6 font-display text-3xl font-extrabold">
          {outsideArea ? "Request received." : "Quote request received."}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {outsideArea ? (
            <>
              We don't currently service ZIP {snapshot.zipCode.trim().slice(0, 5)} — our mobile
              service area is Corona and Riverside, California right now. Your request was received
              and saved, and we'll reach out if we expand to your area.
            </>
          ) : (
            <>
              We'll review your vehicle and requested services and send your personalized quote
              shortly. No work is authorized until you accept your quote.
            </>
          )}
        </p>


        <div className="surface-panel mt-8 space-y-4 p-5 text-left">
          <Row label="Request" value={`#${requestNumber}`} />
          <Row label="Vehicle" value={vehicleTitle(snapshot) || "—"} />
          {configSummary(snapshot.config) && (
            <Row label="Configuration" value={configSummary(snapshot.config)} />
          )}
          <Row label="Mileage" value={`${formatMiles(snapshot.mileage)} miles`} />

          <div className="border-t border-border pt-4">
            <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
              Requested services
            </p>
            <ul className="mt-2 space-y-2">
              {snapshot.services.map((key) => {
                const answers = snapshot.answers[key] ?? {};
                const detail = Object.entries(answers)
                  .flatMap(([qid, v]) =>
                    Array.isArray(v)
                      ? v.map((x) => answerLabel(key, qid, x))
                      : String(v).trim()
                        ? [answerLabel(key, qid, String(v).trim())]
                        : [],
                  )
                  .join(" · ");
                return (
                  <li key={key} className="text-sm">
                    <span className="font-medium">{serviceLabel(key)}</span>
                    {detail && (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="border-t border-border pt-4">
            <Row label="Preferred contact" value={contactLabel} />
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <Button asChild size="lg" className="h-13 w-full rounded-full text-sm tracking-[0.12em]">
            <Link to="/">BACK TO REPARA</Link>
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={onAnother}
            className="h-13 w-full rounded-full border-border bg-transparent text-sm tracking-[0.12em]"
          >
            REQUEST ANOTHER QUOTE
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs tracking-[0.16em] text-muted-foreground uppercase">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}
