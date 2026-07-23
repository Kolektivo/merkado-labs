"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  LoaderCircle,
} from "lucide-react";

import { ListingImageGallery } from "@/components/listing-image-gallery";
import { PriceDisplay } from "@/components/price-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildPriceDisplay } from "@/lib/domain/price-display";
import { PUBLIC_ATTRIBUTE_DISPLAY_LABELS } from "@/lib/domain/public-attributes";
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
}: {
  mode: "create" | "edit";
  listingId?: string;
  initialValues?: Partial<NativeWizardValues>;
  initialImages?: NativeWizardImage[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<NativeWizardValues>({
    ...EMPTY,
    ...initialValues,
  });
  const [listingId, setListingId] = useState<string | undefined>(initialListingId);
  const [images, setImages] = useState<NativeWizardImage[]>(initialImages ?? []);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  function update<K extends keyof NativeWizardValues>(
    key: K,
    value: NativeWizardValues[K],
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
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
    startTransition(async () => {
      try {
        if (step === 1 || step === 2) {
          await ensureSaved();
        }
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
    startTransition(async () => {
      try {
        const id = await ensureSaved();
        const form = new FormData();
        for (const file of Array.from(files).slice(0, MAX_NATIVE_IMAGES)) {
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
        setSuccess("Images uploaded.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
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
    setImages(ordered);
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reorder failed.");
      }
    });
  }

  function saveDraft() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const id = await ensureSaved();
        setSuccess("Draft saved.");
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
          body: JSON.stringify({ action: "publish" }),
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

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2">
        {NATIVE_WIZARD_STEPS.map((item) => (
          <li key={item.id}>
            <Badge variant={step === item.id ? "default" : "outline"}>
              {item.id}. {item.label}
            </Badge>
          </li>
        ))}
      </ol>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700">
          {success}
        </p>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Property details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="listingType">Sale or rent</Label>
              <select
                id="listingType"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
              <Label htmlFor="realEstateType">Real estate type</Label>
              <select
                id="realEstateType"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={values.realEstateType}
                onChange={(event) => update("realEstateType", event.target.value)}
              >
                {REAL_ESTATE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={values.title}
                onChange={(event) => update("title", event.target.value)}
                placeholder="Modern apartment in Mahaai"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="neighbourhood">Neighbourhood / location</Label>
              <Input
                id="neighbourhood"
                value={values.neighbourhood}
                onChange={(event) => update("neighbourhood", event.target.value)}
                placeholder="Mahaai"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="originalPrice">Price</Label>
              <Input
                id="originalPrice"
                inputMode="decimal"
                value={values.originalPrice}
                onChange={(event) => update("originalPrice", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="originalCurrency">Original currency</Label>
              <select
                id="originalCurrency"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
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
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bathrooms">Bathrooms</Label>
              <Input
                id="bathrooms"
                inputMode="decimal"
                value={values.bathrooms}
                onChange={(event) => update("bathrooms", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="floorAreaM2">Floor area (m²)</Label>
              <Input
                id="floorAreaM2"
                inputMode="decimal"
                value={values.floorAreaM2}
                onChange={(event) => update("floorAreaM2", event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="lotAreaValue">Lot area</Label>
                <Input
                  id="lotAreaValue"
                  inputMode="decimal"
                  value={values.lotAreaValue}
                  onChange={(event) => update("lotAreaValue", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lotAreaUnit">Lot unit</Label>
                <Input
                  id="lotAreaUnit"
                  value={values.lotAreaUnit}
                  onChange={(event) => update("lotAreaUnit", event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <textarea
                id="description"
                className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={values.description}
                onChange={(event) => update("description", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactMethod">Contact method</Label>
              <select
                id="contactMethod"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={values.contactMethod}
                onChange={(event) => update("contactMethod", event.target.value)}
              >
                {CONTACT_METHOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactValue">Contact value</Label>
              <Input
                id="contactValue"
                value={values.contactValue}
                onChange={(event) => update("contactValue", event.target.value)}
                placeholder="+5999…"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="contactName">Contact name (optional)</Label>
              <Input
                id="contactName"
                value={values.contactName}
                onChange={(event) => update("contactName", event.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Features</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {NATIVE_FEATURE_KEYS.map((key) => {
              const checked = values.features.includes(key);
              return (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
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
                  {PUBLIC_ATTRIBUTE_DISPLAY_LABELS[key] ?? key}
                </label>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Photos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-sm text-muted-foreground">
              <ImagePlus className="size-5" />
              <span>Upload JPG, PNG, or WebP (max 5MB each)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(event) => onUpload(event.target.files)}
              />
            </label>
            {images.length ? (
              <ul className="space-y-3">
                {images.map((image, index) => (
                  <li
                    key={image.storagePath}
                    className="flex flex-wrap items-center gap-3 rounded-md border p-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.publicUrl}
                      alt=""
                      className="size-16 rounded object-cover"
                    />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate">{image.storagePath}</p>
                      {image.isPrimary ? (
                        <Badge variant="secondary">Cover</Badge>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={index === 0 || pending}
                        onClick={() => moveImage(index, -1)}
                      >
                        Up
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={index === images.length - 1 || pending}
                        onClick={() => moveImage(index, 1)}
                      >
                        Down
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No photos yet. At least one is required before publishing.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden py-0">
            <ListingImageGallery
              images={images.map((image) => image.publicUrl)}
              altBase={values.title || "Property preview"}
              variant="card"
            />
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap gap-2">
                <Badge>{values.listingType === "rent" ? "Rent" : "Buy"}</Badge>
                <Badge variant="outline">User provided</Badge>
                <Badge variant="secondary">{values.realEstateType}</Badge>
                <Badge variant="outline">Draft preview</Badge>
              </div>
              <h2 className="text-xl font-semibold tracking-tight">
                {values.title || "Untitled property"}
              </h2>
              {previewPrice ? (
                <PriceDisplay model={previewPrice} size="md" />
              ) : null}
              <p className="text-sm text-muted-foreground">
                {values.neighbourhood || "Location pending"}
                {values.bedrooms ? ` · ${values.bedrooms} bed` : ""}
                {values.bathrooms ? ` · ${values.bathrooms} bath` : ""}
              </p>
              {values.features.length ? (
                <ul className="flex flex-wrap gap-2">
                  {values.features.map((feature) => (
                    <li key={feature}>
                      <Badge variant="secondary">
                        {PUBLIC_ATTRIBUTE_DISPLAY_LABELS[feature] ?? feature}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Publish readiness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                Origin: <strong>manual / native</strong> (Labs admin prototype)
              </p>
              <p>
                Contact: {values.contactMethod} · {values.contactValue || "—"}
              </p>
              <p>Images: {images.length}</p>
              {!publishValidation.ok ? (
                <ul className="list-disc space-y-1 pl-5 text-destructive">
                  {publishValidation.errors.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-emerald-700">
                  Ready to publish into the shared Browse / Passport read model.
                </p>
              )}
              <p className="text-muted-foreground">
                AI enrichment is not run automatically for native listings.
                Scraped source-absence rules do not apply.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={step === 1 || pending}
          onClick={() => setStep((current) => Math.max(1, current - 1))}
        >
          <ArrowLeft data-icon="inline-start" />
          Back
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending || !draftValidation.ok}
            onClick={saveDraft}
          >
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            Save draft
          </Button>
          {step < 4 ? (
            <Button type="button" disabled={pending} onClick={goNext}>
              Continue
              <ArrowRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button
              type="button"
              disabled={pending || !publishValidation.ok}
              onClick={publish}
            >
              {pending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Check data-icon="inline-start" />
              )}
              {mode === "edit" ? "Save & publish" : "Publish"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
