"use client";

import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Eye,
  ImagePlus,
  Images,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";

import { ListingImageGallery } from "@/components/listing-image-gallery";
import { PriceDisplay } from "@/components/price-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { buildPriceDisplay } from "@/lib/domain/price-display";
import { PUBLIC_ATTRIBUTE_DISPLAY_LABELS } from "@/lib/domain/public-attributes";
import { publicListingTypeLabel } from "@/lib/domain/public-presentation";
import { titleCase } from "@/lib/format";
import { convertOriginalToBenchmark } from "@/lib/native-listings/currency";
import {
  CONTACT_METHOD_OPTIONS,
  CURRENCY_OPTIONS,
  LISTING_TYPE_OPTIONS,
  MAX_NATIVE_IMAGES,
  NATIVE_FEATURE_KEYS,
  NATIVE_WIZARD_STEPS,
  REAL_ESTATE_TYPE_OPTIONS,
} from "@/lib/native-listings/constants";
import {
  validateNativeDraft,
  validateNativePublish,
} from "@/lib/native-listings/validation";
import { cn } from "@/lib/utils";

export type NativeWizardImage = {
  storagePath: string;
  publicUrl: string;
  sortOrder: number;
  isPrimary: boolean;
};

export type NativeWizardValues = {
  listingType: string;
  title: string;
  realEstateType: string;
  neighbourhood: string;
  originalPrice: string;
  originalCurrency: string;
  bedrooms: string;
  bathrooms: string;
  floorAreaM2: string;
  lotAreaValue: string;
  lotAreaUnit: string;
  description: string;
  features: string[];
  contactName: string;
  contactMethod: string;
  contactValue: string;
};

const EMPTY: NativeWizardValues = {
  listingType: "sale",
  title: "",
  realEstateType: "house",
  neighbourhood: "",
  originalPrice: "",
  originalCurrency: "XCG",
  bedrooms: "",
  bathrooms: "",
  floorAreaM2: "",
  lotAreaValue: "",
  lotAreaUnit: "m2",
  description: "",
  features: [],
  contactName: "",
  contactMethod: "whatsapp",
  contactValue: "",
};

const SELECT_CLASS =
  "h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 sm:h-9";

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden>
      *
    </span>
  );
}

function FieldMessage({
  id,
  error,
  children,
}: {
  id: string;
  error?: string | null;
  children?: ReactNode;
}) {
  if (!error && !children) return null;
  return (
    <p
      id={id}
      className={cn(
        "text-xs text-muted-foreground",
        error && "font-medium text-destructive",
      )}
    >
      {error ?? children}
    </p>
  );
}

function ReadinessRow({
  complete,
  children,
}: {
  complete: boolean;
  children: ReactNode;
}) {
  return (
    <li className="flex items-start gap-2">
      {complete ? (
        <CheckCircle2
          className="mt-0.5 size-4 shrink-0 text-emerald-600"
          aria-hidden
        />
      ) : (
        <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className={complete ? "text-foreground" : "text-muted-foreground"}>
        {children}
      </span>
    </li>
  );
}

function toPayload(values: NativeWizardValues) {
  const num = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    listingType: values.listingType,
    title: values.title,
    realEstateType: values.realEstateType,
    neighbourhood: values.neighbourhood,
    originalPrice: num(values.originalPrice),
    originalCurrency: values.originalCurrency,
    bedrooms: num(values.bedrooms),
    bathrooms: num(values.bathrooms),
    floorAreaM2: num(values.floorAreaM2),
    lotAreaValue: num(values.lotAreaValue),
    lotAreaUnit: values.lotAreaUnit || null,
    description: values.description,
    features: values.features,
    contactName: values.contactName,
    contactMethod: values.contactMethod,
    contactValue: values.contactValue,
  };
}

export function NativeListingWizard({
  mode,
  listingId: initialListingId,
  initialValues,
  initialImages,
  initialStatus = "draft",
  initialPublicEligible = false,
}: {
  mode: "create" | "edit";
  listingId?: string;
  initialValues?: Partial<NativeWizardValues>;
  initialImages?: NativeWizardImage[];
  initialStatus?: string;
  initialPublicEligible?: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<NativeWizardValues>({
    ...EMPTY,
    ...initialValues,
  });
  const [listingId, setListingId] = useState<string | undefined>(initialListingId);
  const [images, setImages] = useState<NativeWizardImage[]>(initialImages ?? []);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [confirmRemovePath, setConfirmRemovePath] = useState<string | null>(null);
  const [currentPublicEligible, setCurrentPublicEligible] = useState(
    initialPublicEligible,
  );
  const [pending, startTransition] = useTransition();
  const remainingImageSlots = MAX_NATIVE_IMAGES - images.length;
  const isActiveEdit = mode === "edit" && initialStatus === "active";
  const isUnpublishedEdit = mode === "edit" && initialStatus === "unpublished";
  const publishActionAvailable =
    mode === "create" || ["draft", "unpublished"].includes(initialStatus);

  const draftValidation = useMemo(
    () => validateNativeDraft(toPayload(values)),
    [values],
  );
  const publishValidation = useMemo(
    () =>
      validateNativePublish({
        draft: toPayload(values),
        imageCount: images.length,
      }),
    [values, images.length],
  );

  const previewPrice = useMemo(() => {
    const amount = Number(values.originalPrice);
    if (!Number.isFinite(amount)) return null;
    const conversion = convertOriginalToBenchmark(
      amount,
      values.originalCurrency,
    );
    return buildPriceDisplay({
      originalPrice: amount,
      originalCurrency: values.originalCurrency,
      benchmarkPriceXcg: conversion.benchmarkPriceXcg,
    });
  }, [values.originalPrice, values.originalCurrency]);

  const fieldErrors = useMemo(() => {
    const price = Number(values.originalPrice);
    return {
      title: !values.title.trim()
        ? "Add a property title."
        : values.title.trim().length > 160
          ? "Keep the title to 160 characters or fewer."
          : null,
      neighbourhood: !values.neighbourhood.trim()
        ? "Add the neighbourhood or location."
        : null,
      originalPrice:
        !values.originalPrice.trim() || !Number.isFinite(price) || price < 0
          ? "Enter a valid asking price."
          : null,
      contactValue: !values.contactValue.trim()
        ? "Add the contact details buyers or renters should use."
        : values.contactMethod === "email" &&
            !values.contactValue.includes("@")
          ? "Enter a valid email address."
          : null,
    };
  }, [values]);

  function update<K extends keyof NativeWizardValues>(
    key: K,
    value: NativeWizardValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setError(null);
    setSuccess(null);
  }

  async function ensureSaved(): Promise<string> {
    const payload = toPayload(values);
    const validation = validateNativeDraft(payload);
    if (!validation.ok) {
      throw new Error(validation.errors.join(" "));
    }

    if (!listingId) {
      const response = await fetch("/api/native-listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Create failed.");
      setListingId(data.id);
      return data.id as string;
    }

    const response = await fetch(`/api/native-listings/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Update failed.");
    return listingId;
  }

  function goNext() {
    setError(null);
    setSuccess(null);
    if ((step === 1 || step === 2) && !draftValidation.ok) {
      setValidationAttempted(true);
      setError("Check the highlighted fields before continuing.");
      return;
    }
    startTransition(async () => {
      try {
        if (step === 1 || step === 2) {
          await ensureSaved();
        }
        setValidationAttempted(false);
        setStep((current) => Math.min(4, current + 1));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to continue.");
      }
    });
  }

  function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setSuccess(null);
    const selected = Array.from(files);
    if (remainingImageSlots <= 0) {
      setError(`This property already has the maximum of ${MAX_NATIVE_IMAGES} photos.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (selected.length > remainingImageSlots) {
      setError(
        `You selected ${selected.length} photos, but only ${remainingImageSlots} slot${remainingImageSlots === 1 ? "" : "s"} remain.`,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    startTransition(async () => {
      try {
        const id = await ensureSaved();
        const form = new FormData();
        for (const file of selected) {
          form.append("files", file);
        }
        const response = await fetch(`/api/native-listings/${id}/images`, {
          method: "POST",
          body: form,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Upload failed.");
        const uploaded = (data.uploaded ?? []) as Array<{
          path: string;
          url: string;
          sortOrder: number;
        }>;
        setImages((prev) => [
          ...prev,
          ...uploaded.map((item) => ({
            storagePath: item.path,
            publicUrl: item.url,
            sortOrder: item.sortOrder,
            isPrimary: item.sortOrder === 0 && prev.length === 0,
          })),
        ]);
        setSuccess(
          `${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} uploaded.`,
        );
        if (typeof data.eligibility?.eligible === "boolean") {
          setCurrentPublicEligible(data.eligibility.eligible);
        }
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  }

  function moveImage(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= images.length) return;
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    const ordered = next.map((image, sortOrder) => ({
      ...image,
      sortOrder,
      isPrimary: sortOrder === 0,
    }));
    const previous = images;
    setImages(ordered);
    setError(null);
    setSuccess(null);
    if (!listingId) return;
    startTransition(async () => {
      try {
        const response = await fetch(`/api/native-listings/${listingId}/images`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderedPaths: ordered.map((image) => image.storagePath),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Reorder failed.");
        setSuccess("Photo order updated.");
      } catch (err) {
        setImages(previous);
        setError(err instanceof Error ? err.message : "Reorder failed.");
      }
    });
  }

  function setCover(index: number) {
    if (index === 0) return;
    const next = [...images];
    const [item] = next.splice(index, 1);
    next.unshift(item);
    const previous = images;
    const ordered = next.map((image, sortOrder) => ({
      ...image,
      sortOrder,
      isPrimary: sortOrder === 0,
    }));
    setImages(ordered);
    setError(null);
    setSuccess(null);
    if (!listingId) return;
    startTransition(async () => {
      try {
        const response = await fetch(`/api/native-listings/${listingId}/images`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderedPaths: ordered.map((image) => image.storagePath),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Cover update failed.");
        setSuccess("Cover photo updated.");
      } catch (err) {
        setImages(previous);
        setError(err instanceof Error ? err.message : "Cover update failed.");
      }
    });
  }

  function removeImage(storagePath: string) {
    if (!listingId) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/native-listings/${listingId}/images`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storagePath }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Remove failed.");
        setImages((current) =>
          current
            .filter((image) => image.storagePath !== storagePath)
            .map((image, sortOrder) => ({
              ...image,
              sortOrder,
              isPrimary: sortOrder === 0,
            })),
        );
        if (typeof data.eligible === "boolean") {
          setCurrentPublicEligible(data.eligible);
        }
        setConfirmRemovePath(null);
        setSuccess(
          data.storageWarning
            ? "Photo removed from the listing. Storage cleanup needs attention."
            : isActiveEdit && data.eligible === false
              ? "Photo removed. This property is now hidden from Public preview until the missing publish requirements are restored."
              : "Photo removed.",
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to remove photo.");
      }
    });
  }

  function saveDraft() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const id = await ensureSaved();
        setSuccess(mode === "edit" ? "Changes saved." : "Draft saved.");
        router.push(`/listings/${id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to save draft.");
      }
    });
  }

  function publish() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        if (!publishValidation.ok) {
          throw new Error(publishValidation.errors.join(" "));
        }
        const id = await ensureSaved();
        const response = await fetch(`/api/native-listings/${id}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: isUnpublishedEdit ? "republish" : "publish",
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Publish failed.");
        setSuccess("Listing published.");
        router.push(`/browse/${id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to publish.");
      }
    });
  }

  function saveActiveChanges() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const id = await ensureSaved();
        setSuccess("Changes saved.");
        router.push(`/listings/${id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to save changes.");
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <nav aria-label="Property listing progress">
        <ol className="grid grid-cols-4 gap-1 rounded-xl border bg-card p-1.5 sm:gap-2 sm:p-2">
          {NATIVE_WIZARD_STEPS.map((item) => {
            const complete = item.id < step;
            const current = item.id === step;
            return (
              <li key={item.id} className="min-w-0">
                <button
                  type="button"
                  className={cn(
                    "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-3 sm:text-sm",
                    current && "bg-foreground text-background",
                    complete && "bg-muted text-foreground hover:bg-muted/80",
                    !current && !complete && "text-muted-foreground",
                  )}
                  aria-current={current ? "step" : undefined}
                  aria-label={`${item.label}${complete ? ", complete" : current ? ", current step" : ""}`}
                  disabled={pending || item.id > step}
                  onClick={() => item.id < step && setStep(item.id)}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                      current && "border-background/50",
                      complete && "border-foreground/20 bg-background",
                    )}
                  >
                    {complete ? <Check className="size-3" aria-hidden /> : item.id}
                  </span>
                  <span
                    className={cn(
                      "hidden truncate sm:inline",
                      current && "inline",
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Check this step</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert aria-live="polite">
          <CheckCircle2 aria-hidden />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      {step === 1 ? (
        <Card className="gap-0">
          <CardHeader>
            <CardTitle>Property details</CardTitle>
            <CardDescription>
              Start with the essentials buyers and renters use to understand the
              property. Fields marked <RequiredMark /> are required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 [&_input[data-slot=input]]:h-11 sm:[&_input[data-slot=input]]:h-9">
            <section className="space-y-4" aria-labelledby="listing-basics">
              <div>
                <h2 id="listing-basics" className="font-medium">
                  Listing basics
                </h2>
                <p className="text-xs text-muted-foreground">
                  Choose how the property should appear in Properties and Public
                  preview.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="listingType">
                    Offer type <RequiredMark />
                  </Label>
                  <select
                    id="listingType"
                    className={SELECT_CLASS}
                    value={values.listingType}
                    onChange={(event) => update("listingType", event.target.value)}
                  >
                    {LISTING_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="realEstateType">
                    Real estate type <RequiredMark />
                  </Label>
                  <select
                    id="realEstateType"
                    className={SELECT_CLASS}
                    value={values.realEstateType}
                    onChange={(event) =>
                      update("realEstateType", event.target.value)
                    }
                  >
                    {REAL_ESTATE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="title">
                      Property title <RequiredMark />
                    </Label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {values.title.length}/160
                    </span>
                  </div>
                  <Input
                    id="title"
                    value={values.title}
                    maxLength={160}
                    aria-invalid={
                      validationAttempted && Boolean(fieldErrors.title)
                    }
                    aria-describedby="title-help"
                    onChange={(event) => update("title", event.target.value)}
                    placeholder="Modern apartment with pool in Mahaai"
                  />
                  <FieldMessage
                    id="title-help"
                    error={validationAttempted ? fieldErrors.title : null}
                  >
                    Keep it specific and easy to scan. This title appears
                    publicly.
                  </FieldMessage>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="neighbourhood">
                    Neighbourhood or location <RequiredMark />
                  </Label>
                  <Input
                    id="neighbourhood"
                    value={values.neighbourhood}
                    aria-invalid={
                      validationAttempted && Boolean(fieldErrors.neighbourhood)
                    }
                    aria-describedby="neighbourhood-help"
                    onChange={(event) =>
                      update("neighbourhood", event.target.value)
                    }
                    placeholder="Mahaai"
                  />
                  <FieldMessage
                    id="neighbourhood-help"
                    error={
                      validationAttempted ? fieldErrors.neighbourhood : null
                    }
                  >
                    Use the area buyers or renters will recognize.
                  </FieldMessage>
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-4" aria-labelledby="property-facts">
              <div>
                <h2 id="property-facts" className="font-medium">
                  Price and key facts
                </h2>
                <p className="text-xs text-muted-foreground">
                  Add only values you know. Optional facts can be left blank.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2 sm:col-span-1 lg:col-span-2">
                  <Label htmlFor="originalPrice">
                    Asking price <RequiredMark />
                  </Label>
                  <Input
                    id="originalPrice"
                    inputMode="decimal"
                    value={values.originalPrice}
                    aria-invalid={
                      validationAttempted && Boolean(fieldErrors.originalPrice)
                    }
                    aria-describedby="price-help"
                    onChange={(event) =>
                      update("originalPrice", event.target.value)
                    }
                    placeholder="575000"
                  />
                  <FieldMessage
                    id="price-help"
                    error={
                      validationAttempted ? fieldErrors.originalPrice : null
                    }
                  >
                    Enter numbers only; formatting is applied in the preview.
                  </FieldMessage>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="originalCurrency">
                    Currency <RequiredMark />
                  </Label>
                  <select
                    id="originalCurrency"
                    className={SELECT_CLASS}
                    value={values.originalCurrency}
                    onChange={(event) =>
                      update("originalCurrency", event.target.value)
                    }
                  >
                    {CURRENCY_OPTIONS.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bedrooms">Bedrooms</Label>
                  <Input
                    id="bedrooms"
                    inputMode="numeric"
                    value={values.bedrooms}
                    onChange={(event) => update("bedrooms", event.target.value)}
                    placeholder="3"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bathrooms">Bathrooms</Label>
                  <Input
                    id="bathrooms"
                    inputMode="decimal"
                    value={values.bathrooms}
                    onChange={(event) => update("bathrooms", event.target.value)}
                    placeholder="2.5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="floorAreaM2">Floor area (m²)</Label>
                  <Input
                    id="floorAreaM2"
                    inputMode="decimal"
                    value={values.floorAreaM2}
                    onChange={(event) =>
                      update("floorAreaM2", event.target.value)
                    }
                    placeholder="220"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-2">
                  <Label htmlFor="lotAreaValue">Lot area</Label>
                  <Input
                    id="lotAreaValue"
                    inputMode="decimal"
                    value={values.lotAreaValue}
                    onChange={(event) =>
                      update("lotAreaValue", event.target.value)
                    }
                    placeholder="650"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lotAreaUnit">Lot area unit</Label>
                  <select
                    id="lotAreaUnit"
                    className={SELECT_CLASS}
                    value={values.lotAreaUnit}
                    onChange={(event) =>
                      update("lotAreaUnit", event.target.value)
                    }
                  >
                    <option value="m2">m²</option>
                    <option value="sqft">sq ft</option>
                    <option value="are">are</option>
                  </select>
                </div>
              </div>
            </section>

            <Separator />

            <section className="space-y-4" aria-labelledby="description-contact">
              <div>
                <h2 id="description-contact" className="font-medium">
                  Description and contact
                </h2>
                <p className="text-xs text-muted-foreground">
                  Explain what makes the property useful, then tell interested
                  people how to reach you.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">Property description</Label>
                  <textarea
                    id="description"
                    className="min-h-32 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={values.description}
                    onChange={(event) =>
                      update("description", event.target.value)
                    }
                    placeholder="Describe the layout, condition, outdoor space, and nearby amenities."
                  />
                  <FieldMessage id="description-help">
                    Plain text is shown on the Property Passport.
                  </FieldMessage>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactMethod">
                    Contact method <RequiredMark />
                  </Label>
                  <select
                    id="contactMethod"
                    className={SELECT_CLASS}
                    value={values.contactMethod}
                    onChange={(event) =>
                      update("contactMethod", event.target.value)
                    }
                  >
                    {CONTACT_METHOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactValue">
                    Contact details <RequiredMark />
                  </Label>
                  <Input
                    id="contactValue"
                    type={values.contactMethod === "email" ? "email" : "text"}
                    value={values.contactValue}
                    aria-invalid={
                      validationAttempted && Boolean(fieldErrors.contactValue)
                    }
                    aria-describedby="contact-help"
                    onChange={(event) =>
                      update("contactValue", event.target.value)
                    }
                    placeholder={
                      values.contactMethod === "email"
                        ? "name@example.com"
                        : "+5999 512 3456"
                    }
                  />
                  <FieldMessage
                    id="contact-help"
                    error={
                      validationAttempted ? fieldErrors.contactValue : null
                    }
                  >
                    This is visible on the public Property Passport.
                  </FieldMessage>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="contactName">Contact name (optional)</Label>
                  <Input
                    id="contactName"
                    value={values.contactName}
                    onChange={(event) =>
                      update("contactName", event.target.value)
                    }
                    placeholder="Mariana"
                  />
                </div>
              </div>
            </section>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Property features</CardTitle>
            <CardDescription>
              Select the features that apply. These appear as simple highlights
              on the Browse card and Property Passport.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {NATIVE_FEATURE_KEYS.map((key) => {
              const checked = values.features.includes(key);
              return (
                <label
                  key={key}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/50",
                    checked && "border-foreground/25 bg-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-foreground"
                    checked={checked}
                    onChange={() => {
                      update(
                        "features",
                        checked
                          ? values.features.filter((item) => item !== key)
                          : [...values.features, key],
                      );
                    }}
                  />
                  <span className="font-medium">
                    {PUBLIC_ATTRIBUTE_DISPLAY_LABELS[key] ?? key}
                  </span>
                </label>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Property photos</CardTitle>
                <CardDescription>
                  Add up to {MAX_NATIVE_IMAGES} photos. The first photo is the
                  cover shown in Browse.
                </CardDescription>
              </div>
              <Badge variant="outline" className="tabular-nums">
                {images.length}/{MAX_NATIVE_IMAGES} photos
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <label
              className={cn(
                "flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center text-sm transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted/40",
                (pending || remainingImageSlots === 0) &&
                  "pointer-events-none opacity-60",
              )}
            >
              {pending ? (
                <LoaderCircle className="size-6 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="size-6" aria-hidden />
              )}
              <span className="font-medium text-foreground">
                {pending
                  ? "Uploading photos…"
                  : remainingImageSlots === 0
                    ? "Photo limit reached"
                    : "Choose photos to upload"}
              </span>
              <span className="text-xs text-muted-foreground">
                JPG, PNG, or WebP · 5MB each · {remainingImageSlots} slot
                {remainingImageSlots === 1 ? "" : "s"} remaining
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                disabled={pending || remainingImageSlots === 0}
                onChange={(event) => onUpload(event.target.files)}
              />
            </label>
            {images.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {images.map((image, index) => (
                  <li
                    key={image.storagePath}
                    className="overflow-hidden rounded-xl border bg-card"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.publicUrl}
                        alt={`Property photo ${index + 1}${image.isPrimary ? ", cover photo" : ""}`}
                        className="size-full object-cover"
                      />
                      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/55 to-transparent p-3 text-white">
                        <span className="text-xs font-medium">
                          Photo {index + 1}
                        </span>
                        {image.isPrimary ? (
                          <Badge className="border-white/25 bg-black/55 text-white">
                            <Star className="size-3 fill-current" aria-hidden />
                            Cover
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="space-y-3 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            className="size-11 sm:size-7"
                            aria-label={`Move photo ${index + 1} earlier`}
                            disabled={index === 0 || pending}
                            onClick={() => moveImage(index, -1)}
                          >
                            <ChevronUp aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            className="size-11 sm:size-7"
                            aria-label={`Move photo ${index + 1} later`}
                            disabled={index === images.length - 1 || pending}
                            onClick={() => moveImage(index, 1)}
                          >
                            <ChevronDown aria-hidden />
                          </Button>
                          {!image.isPrimary ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-11 sm:h-7"
                              disabled={pending}
                              onClick={() => setCover(index)}
                            >
                              <Star data-icon="inline-start" aria-hidden />
                              Set cover
                            </Button>
                          ) : null}
                        </div>
                        {confirmRemovePath === image.storagePath ? null : (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            className="size-11 text-destructive hover:text-destructive sm:size-7"
                            aria-label={`Remove photo ${index + 1}`}
                            disabled={pending}
                            onClick={() =>
                              setConfirmRemovePath(image.storagePath)
                            }
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        )}
                      </div>
                      {confirmRemovePath === image.storagePath ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/5 p-2 text-xs">
                          <span>Remove this photo?</span>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              disabled={pending}
                              onClick={() => setConfirmRemovePath(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="destructive"
                              disabled={pending}
                              onClick={() => removeImage(image.storagePath)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-lg bg-muted/45 p-4 text-sm">
                <p className="font-medium">No photos yet</p>
                <p className="mt-1 text-muted-foreground">
                  Add at least one photo before publishing. Landscape images
                  work best for Browse cards.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Review before publishing</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check how the property will appear in Browse and on its Property
              Passport. Nothing becomes public until you publish.
            </p>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
            <section aria-labelledby="browse-card-preview">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 id="browse-card-preview" className="font-medium">
                    Browse card preview
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Matches the public Properties grid.
                  </p>
                </div>
                <Badge variant="outline">Preview</Badge>
              </div>
              <Card className="mx-auto h-full max-w-md overflow-hidden py-0 lg:mx-0">
                <ListingImageGallery
                  images={images.map((image) => image.publicUrl)}
                  altBase={values.title || "Property preview"}
                  variant="card"
                  aspectClassName="relative h-44 bg-muted"
                />
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge>
                      {publicListingTypeLabel(values.listingType)}
                    </Badge>
                    <Badge variant="outline">User provided</Badge>
                  </div>
                  <h3 className="line-clamp-2 font-medium">
                    {values.title || "Untitled property"}
                  </h3>
                  {previewPrice ? (
                    <PriceDisplay model={previewPrice} size="sm" />
                  ) : null}
                  <p className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
                    <span className="inline-flex min-w-0 items-center gap-1 truncate">
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">
                        {values.neighbourhood || "Location pending"}
                      </span>
                    </span>
                    {values.bedrooms || values.bathrooms ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">
                          {[
                            values.bedrooms
                              ? `${values.bedrooms} bedroom${values.bedrooms === "1" ? "" : "s"}`
                              : null,
                            values.bathrooms
                              ? `${values.bathrooms} bathroom${values.bathrooms === "1" ? "" : "s"}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </>
                    ) : null}
                  </p>
                  {values.features.length ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {values.features
                        .map(
                          (feature) =>
                            PUBLIC_ATTRIBUTE_DISPLAY_LABELS[feature] ?? feature,
                        )
                        .join(" · ")}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <CardTitle>
                  {isActiveEdit
                    ? "Ready to save"
                    : isUnpublishedEdit
                      ? "Ready to republish?"
                      : "Ready to publish?"}
                </CardTitle>
                <CardDescription>
                  {isActiveEdit
                    ? "This property is already public. Saving updates its current information."
                    : "Publishing makes this property visible in Browse and creates its public Property Passport."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <ul className="space-y-2">
                  <ReadinessRow complete={draftValidation.ok}>
                    Required property details are complete
                  </ReadinessRow>
                  <ReadinessRow complete={images.length > 0}>
                    At least one property photo is included
                  </ReadinessRow>
                  <ReadinessRow
                    complete={Boolean(
                      values.contactMethod && values.contactValue.trim(),
                    )}
                  >
                    Public contact details are included
                  </ReadinessRow>
                </ul>
                {!publishValidation.ok ? (
                  <Alert variant="destructive">
                    <AlertTitle>
                      {isActiveEdit
                        ? "Property is hidden from Public preview"
                        : "Not ready yet"}
                    </AlertTitle>
                    <AlertDescription>
                      {isActiveEdit ? (
                        <p className="mb-2">
                          The property is currently hidden from Public preview.
                          Restore these requirements to make it public again:
                        </p>
                      ) : null}
                      <ul className="list-disc space-y-1 pl-4">
                        {publishValidation.errors.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <ShieldCheck aria-hidden />
                    <AlertTitle>
                      {isActiveEdit ? "Safe to save" : "Ready for Public preview"}
                    </AlertTitle>
                    <AlertDescription>
                      {currentPublicEligible
                        ? "The current listing is public. Changes will appear after saving."
                        : "This owner-entered listing will be labeled User provided."}
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-xs text-muted-foreground">
                  This Labs prototype does not run AI enrichment or scraper
                  removal checks on owner-entered properties.
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="size-4" aria-hidden />
                    Property Passport preview
                  </CardTitle>
                  <CardDescription>
                    The public detail page shown after publishing.
                  </CardDescription>
                </div>
                <Badge variant="outline">User provided</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-5 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <ListingImageGallery
                  images={images.map((image) => image.publicUrl)}
                  altBase={values.title || "Property preview"}
                  variant="detail"
                  aspectClassName="relative aspect-[16/10] bg-muted"
                />
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge>
                      {publicListingTypeLabel(values.listingType)}
                    </Badge>
                    <Badge variant="outline">
                      {titleCase(values.realEstateType)}
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">
                      {values.title || "Untitled property"}
                    </h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-4" aria-hidden />
                      {values.neighbourhood || "Location pending"}
                    </p>
                  </div>
                  {previewPrice ? (
                    <PriceDisplay model={previewPrice} size="lg" />
                  ) : null}
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    {values.bedrooms ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">Bedrooms</dt>
                        <dd className="font-medium">{values.bedrooms}</dd>
                      </div>
                    ) : null}
                    {values.bathrooms ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">Bathrooms</dt>
                        <dd className="font-medium">{values.bathrooms}</dd>
                      </div>
                    ) : null}
                    {values.floorAreaM2 ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">Floor area</dt>
                        <dd className="font-medium">{values.floorAreaM2} m²</dd>
                      </div>
                    ) : null}
                    {values.lotAreaValue ? (
                      <div>
                        <dt className="text-xs text-muted-foreground">Lot area</dt>
                        <dd className="font-medium">
                          {values.lotAreaValue}{" "}
                          {values.lotAreaUnit === "m2"
                            ? "m²"
                            : values.lotAreaUnit}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              </div>
              {values.description ? (
                <>
                  <Separator />
                  <section>
                    <h3 className="font-medium">About this property</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {values.description}
                    </p>
                  </section>
                </>
              ) : null}
              {values.features.length ? (
                <section>
                  <h3 className="font-medium">Property features</h3>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {values.features.map((feature) => (
                      <li key={feature}>
                        <Badge variant="secondary">
                          {PUBLIC_ATTRIBUTE_DISPLAY_LABELS[feature] ?? feature}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <Separator />
              <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">Contact</p>
                  <p className="text-muted-foreground">
                    {titleCase(values.contactMethod)} ·{" "}
                    {values.contactValue || "Not provided"}
                    {values.contactName ? ` · ${values.contactName}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Images className="size-4" aria-hidden />
                  {images.length} photo{images.length === 1 ? "" : "s"}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="sticky bottom-0 z-30 -mx-3 flex items-center justify-between gap-3 border-t bg-background/95 px-3 py-3 shadow-[0_-8px_24px_-20px_rgba(0,0,0,0.5)] backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:shadow-none">
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:h-8"
          disabled={step === 1 || pending}
          onClick={() => setStep((current) => Math.max(1, current - 1))}
        >
          <ArrowLeft data-icon="inline-start" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-8"
            disabled={pending || !draftValidation.ok}
            onClick={saveDraft}
          >
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            <span className="sm:hidden">Save</span>
            <span className="hidden sm:inline">
              {mode === "edit" ? "Save and exit" : "Save draft"}
            </span>
          </Button>
          {step < 4 ? (
            <Button
              type="button"
              className="h-11 sm:h-8"
              disabled={pending}
              onClick={goNext}
            >
              Continue
              <ArrowRight data-icon="inline-end" />
            </Button>
          ) : isActiveEdit || !publishActionAvailable ? (
            <Button
              type="button"
              className="h-11 sm:h-8"
              disabled={pending || !draftValidation.ok}
              onClick={saveActiveChanges}
            >
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Check data-icon="inline-start" />
              )}
              Save changes
            </Button>
          ) : (
            <Button
              type="button"
              className="h-11 sm:h-8"
              disabled={pending || !publishValidation.ok}
              onClick={publish}
            >
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Check data-icon="inline-start" />
              )}
              {isUnpublishedEdit ? "Republish property" : "Publish property"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
