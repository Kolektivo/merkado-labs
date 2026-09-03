"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Landmark, WalletCards } from "lucide-react";

import { HelpTip } from "@/components/help-tip";
import { QuoteResult } from "@/components/rent-advance/quote-result";
import { TermPicker } from "@/components/rent-advance/term-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import { PropertyCover } from "@/components/property-cover";
import { submitNewOfferAction, saveDraftOfferAction } from "@/lib/rent-advance/actions";
import { readCoverImage } from "@/lib/rent-advance/cover-image";
import { isValidPayoutAddress } from "@/lib/rent-advance/custody";
import { buildScheduledReceivables, coverSrcFor } from "@/lib/rent-advance/helpers";
import { CapExceededError, usdCentsToXcgInput, xcgMajorToUsdCents } from "@/lib/rent-advance/money";
import { priceOrBlock, priceQuote, type Quote } from "@/lib/rent-advance/pricing";
import type { Offer } from "@/lib/rent-advance/types";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Property" },
  { id: 2, label: "Renter" },
  { id: 3, label: "Lease" },
  { id: 4, label: "Quality scores" },
  { id: 5, label: "Quote" },
  { id: 6, label: "Payout" },
  { id: 7, label: "Review" },
] as const;

function XcgMoneyInput({
  id,
  cents,
  onCents,
}: {
  id: string;
  cents: number;
  onCents: (cents: number) => void;
}) {
  const [text, setText] = useState(usdCentsToXcgInput(cents));
  return (
    <Input
      id={id}
      type="number"
      min={0}
      step="0.01"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const next = xcgMajorToUsdCents(Number(event.target.value));
        if (Number.isFinite(next) && next > 0) onCents(next);
      }}
    />
  );
}

function Field({
  id,
  label,
  hint,
  tip,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  tip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
        {tip ? <HelpTip label={label}>{tip}</HelpTip> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function applyQuote(offer: Offer, quote: Quote): Offer {
  return {
    ...offer,
    months: quote.months,
    monthlyRentCents: quote.monthlyRentCents,
    feeRate: quote.feeRate,
    baseFeeRate: quote.baseFeeRate,
    relatedPartyPremiumBps: Math.round(quote.relatedPartyPremium * 10_000),
    feeCents: quote.feeCents,
    purchasePriceCents: quote.purchasePriceCents,
    advanceRate: quote.advanceRate,
    monthlyIrr: quote.monthlyIrr,
    nominalAnnualised: quote.nominalAnnualised,
    effectiveAnnualised: quote.effectiveAnnualised,
    lease: { ...offer.lease, monthlyRentCents: quote.monthlyRentCents },
    receivables: buildScheduledReceivables(
      offer.reference,
      quote.monthlyRentCents,
      quote.months,
    ),
  };
}

export function NewOfferWizard({
  initial,
  startStep = 1,
}: {
  initial: Offer;
  startStep?: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(startStep);
  const [offer, setOffer] = useState(initial);
  const [confirmed, setConfirmed] = useState(false);
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftSaved, setDraftSaved] = useState(false);

  const quote = useMemo(() => {
    if (offer.months !== 6) return null;
    try {
      return priceQuote({
        monthlyRentCents: offer.monthlyRentCents,
        months: offer.months,
        passportScore: offer.passport.total,
        payerScore: offer.tenant.scores.total,
        relatedParty: false,
      });
    } catch {
      return null;
    }
  }, [
    offer.months,
    offer.monthlyRentCents,
    offer.passport.total,
    offer.tenant.scores.total,
  ]);

  function patch(updater: (current: Offer) => Offer) {
    setOffer((current) => updater(current));
  }

  function stepIssue(currentStep: number): string | null {
    if (currentStep === 1) {
      if (!offer.property.address.trim()) return "Add the property address.";
      if (!offer.property.district.trim()) return "Add the district.";
      if (!offer.property.summary.trim()) return "Add a short property summary.";
    }
    if (currentStep === 2) {
      if (!offer.tenant.fullName.trim()) return "Add the renter’s full name.";
      if (!offer.tenant.initials.trim()) return "Add the renter’s initials.";
      if (!isValidPayoutAddress(offer.renterWalletAddress)) {
        return "Add the renter’s checksummed 0x wallet address.";
      }
    }
    if (currentStep === 3) {
      if (offer.monthlyRentCents <= 0) return "Enter a monthly rent above zero.";
      if (!offer.lease.startDate || !offer.lease.expiryDate) {
        return "Add the lease start and expiry dates.";
      }
    }
    if (currentStep === 4) {
      if (offer.passport.total < 0 || offer.passport.total > 100) {
        return "Property quality must be between 0 and 100.";
      }
      if (offer.tenant.scores.total < 0 || offer.tenant.scores.total > 100) {
        return "Payment history must be between 0 and 100.";
      }
    }
    if (currentStep === 5) {
      if (offer.months !== 6) return "Only the six-month term can be submitted.";
      if (!quote) return "Enter a valid rent to see a quote.";
      if (quote.capBreached) return "This quote is above the 24% cap.";
    }
    if (currentStep === 6) {
      if (offer.payout.method === "bank") {
        return "Girasol bank payout is a preview and cannot be used in this demo. Choose a Base Sepolia payout address.";
      }
      if (!isValidPayoutAddress(offer.payout.cryptoAddress)) {
        return "Enter a valid checksummed Base Sepolia 0x payout address.";
      }
    }
    return null;
  }

  function saveDraft() {
    setError(null);
    setDraftSaved(false);
    startTransition(async () => {
      try {
        await saveDraftOfferAction(offer);
        setDraftSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save this draft.");
      }
    });
  }

  function submitForReview() {
    setError(null);
    if (!confirmed) {
      setError("Confirm the details before submitting.");
      return;
    }
    if (offer.months !== 6) {
      setError("Only the six-month term is approved for origination.");
      return;
    }
    startTransition(async () => {
      try {
        const priced = priceOrBlock({
          monthlyRentCents: offer.monthlyRentCents,
          months: offer.months,
          passportScore: offer.passport.total,
          payerScore: offer.tenant.scores.total,
          relatedParty: false,
        });
        const next = applyQuote({ ...offer, relatedParty: false, relatedPartyNote: null }, priced);
        await submitNewOfferAction(next);
        router.push(`/originate/${next.reference}`);
        router.refresh();
      } catch (err) {
        if (err instanceof CapExceededError) {
          setError("This quote is above the 24% cap.");
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to submit this offer.");
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <nav aria-label="Create offer progress">
        <ol className="grid grid-cols-4 gap-1 rounded-xl border bg-card p-1.5 sm:grid-cols-7 sm:gap-2 sm:p-2">
          {STEPS.map((item) => {
            const complete = item.id < step;
            const current = item.id === step;
            return (
              <li key={item.id} className="min-w-0">
                <button
                  type="button"
                  className={cn(
                    "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-2 sm:text-sm",
                    current && "bg-primary text-primary-foreground",
                    complete && "bg-muted text-foreground hover:bg-muted/80",
                    !current && !complete && "text-muted-foreground",
                  )}
                  aria-current={current ? "step" : undefined}
                  aria-label={`Step ${item.id}: ${item.label}`}
                  disabled={pending || item.id > step}
                  onClick={() => setStep(item.id)}
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
                  <span className={cn("hidden truncate sm:inline", current && "inline")}>
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <p className="text-sm text-muted-foreground">
        Add the property, renter, and lease. The quote uses those figures.
      </p>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Check this step</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Property</CardTitle>
            <CardDescription>This photo appears on Marketplace.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="address" label="Address">
              <Input
                id="address"
                value={offer.property.address}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    property: { ...current.property, address: event.target.value },
                  }))
                }
              />
            </Field>
            <Field id="district" label="District">
              <Input
                id="district"
                value={offer.property.district}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    property: { ...current.property, district: event.target.value },
                  }))
                }
              />
            </Field>
            <Field id="type" label="Type">
              <Input
                id="type"
                value={offer.property.type}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    property: { ...current.property, type: event.target.value },
                  }))
                }
              />
            </Field>
            <Field id="summary" label="Summary">
              <Input
                id="summary"
                value={offer.property.summary}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    property: { ...current.property, summary: event.target.value },
                  }))
                }
              />
            </Field>
            <Field id="bedrooms" label="Bedrooms">
              <Input
                id="bedrooms"
                type="number"
                min={0}
                value={offer.property.bedrooms}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    property: {
                      ...current.property,
                      bedrooms: Number(event.target.value) || 0,
                    },
                  }))
                }
              />
            </Field>
            <Field id="bathrooms" label="Bathrooms">
              <Input
                id="bathrooms"
                type="number"
                lang="en-US"
                min={0}
                step="0.5"
                value={offer.property.bathrooms}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    property: {
                      ...current.property,
                      bathrooms: Number(event.target.value) || 0,
                    },
                  }))
                }
              />
            </Field>
            <Field id="interior" label="Interior m²">
              <Input
                id="interior"
                type="number"
                min={0}
                value={offer.property.interiorM2}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    property: {
                      ...current.property,
                      interiorM2: Number(event.target.value) || 0,
                    },
                  }))
                }
              />
            </Field>
            <Field id="condition" label="Condition">
              <Input
                id="condition"
                value={offer.property.condition}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    property: { ...current.property, condition: event.target.value },
                  }))
                }
              />
            </Field>
            <div className="sm:col-span-2 space-y-3">
              <Field
                id="cover"
                label="Cover photo"
                hint="JPG, PNG, or WebP. This is the Marketplace image."
              >
                <Input
                  id="cover"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void readCoverImage(file)
                      .then((dataUrl) => {
                        patch((current) => ({
                          ...current,
                          property: { ...current.property, coverImageSrc: dataUrl },
                        }));
                        setError(null);
                      })
                      .catch((err: unknown) => {
                        setError(err instanceof Error ? err.message : "Could not read that photo.");
                      });
                  }}
                />
              </Field>
              <div className="relative aspect-[3/2] w-full max-w-sm overflow-hidden rounded-xl bg-muted">
                <PropertyCover
                  src={coverSrcFor(offer.property.type, offer.property.coverImageSrc)}
                />
              </div>
              {offer.property.coverImageSrc ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-fit"
                  onClick={() =>
                    patch((current) => ({
                      ...current,
                      property: { ...current.property, coverImageSrc: null },
                    }))
                  }
                >
                  Remove photo
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Renter</CardTitle>
            <CardDescription>
              Landlord file only. Holders never see a name, employer, or income.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Alert className="sm:col-span-2">
              <AlertTitle>Shared Labs demo — use fictional details only</AlertTitle>
              <AlertDescription>
                Do not enter a real name, contact, employer, income, or bank
                information. Demo records may be visible to other reviewers.
              </AlertDescription>
            </Alert>
            <Field
              id="renter-wallet"
              label="Rent payer wallet"
              hint="This wallet will receive the payment link and pay rent on Base Sepolia."
              tip="The renter connects this wallet on Merkado Pay. It is separate from the landlord payout wallet."
            >
              <Input
                id="renter-wallet"
                placeholder="0x..."
                spellCheck={false}
                autoCapitalize="none"
                value={offer.renterWalletAddress ?? ""}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    renterWalletAddress: event.target.value,
                  }))
                }
              />
            </Field>
            <Field
              id="full-name"
              label="Full name"
              tip="Landlord file only. Holders never see this."
            >
              <Input
                id="full-name"
                value={offer.tenant.fullName}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    tenant: { ...current.tenant, fullName: event.target.value },
                  }))
                }
              />
            </Field>
            <Field id="initials" label="Initials">
              <Input
                id="initials"
                value={offer.tenant.initials}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    tenant: { ...current.tenant, initials: event.target.value },
                  }))
                }
              />
            </Field>
            <Field
              id="contact"
              label="Contact"
              tip="Landlord file only. Holders never see this."
            >
              <Input
                id="contact"
                value={offer.tenant.contact}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    tenant: { ...current.tenant, contact: event.target.value },
                  }))
                }
              />
            </Field>
            <Field id="employment" label="Employment status">
              <Input
                id="employment"
                value={offer.tenant.employmentStatus}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    tenant: {
                      ...current.tenant,
                      employmentStatus: event.target.value,
                    },
                  }))
                }
              />
            </Field>
            <Field
              id="employer"
              label="Employer"
              tip="Landlord file only. Holders never see this."
            >
              <Input
                id="employer"
                value={offer.tenant.employer}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    tenant: { ...current.tenant, employer: event.target.value },
                  }))
                }
              />
            </Field>
            <Field
              id="income"
              label="Monthly income (XCG)"
              tip="Landlord file only. Holders never see this."
            >
              <XcgMoneyInput
                id="income"
                cents={offer.tenant.monthlyIncomeCents}
                onCents={(monthlyIncomeCents) =>
                  patch((current) => ({
                    ...current,
                    tenant: { ...current.tenant, monthlyIncomeCents },
                  }))
                }
              />
            </Field>
            <Field id="evidenced" label="Months evidenced">
              <Input
                id="evidenced"
                type="number"
                min={0}
                value={offer.tenant.monthsEvidenced}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    tenant: {
                      ...current.tenant,
                      monthsEvidenced: Number(event.target.value) || 0,
                    },
                  }))
                }
              />
            </Field>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Lease</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="start" label="Start date">
              <Input
                id="start"
                type="date"
                value={offer.lease.startDate}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    lease: { ...current.lease, startDate: event.target.value },
                  }))
                }
              />
            </Field>
            <Field id="expiry" label="Expiry date">
              <Input
                id="expiry"
                type="date"
                value={offer.lease.expiryDate}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    lease: { ...current.lease, expiryDate: event.target.value },
                  }))
                }
              />
            </Field>
            <Field id="remaining" label="Months remaining">
              <Input
                id="remaining"
                type="number"
                min={0}
                value={offer.lease.monthsRemaining}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    lease: {
                      ...current.lease,
                      monthsRemaining: Number(event.target.value) || 0,
                    },
                  }))
                }
              />
            </Field>
            <Field id="notice" label="Notice period">
              <Input
                id="notice"
                value={offer.lease.noticePeriod}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    lease: { ...current.lease, noticePeriod: event.target.value },
                  }))
                }
              />
            </Field>
            <Field id="rent" label="Monthly rent (XCG)">
              <XcgMoneyInput
                id="rent"
                cents={offer.monthlyRentCents}
                onCents={(cents) =>
                  patch((current) => ({
                    ...current,
                    monthlyRentCents: cents,
                    lease: { ...current.lease, monthlyRentCents: cents },
                  }))
                }
              />
            </Field>
            <Field id="includes" label="Rent includes">
              <Input
                id="includes"
                value={offer.lease.rentIncludes}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    lease: { ...current.lease, rentIncludes: event.target.value },
                  }))
                }
              />
            </Field>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle>Quality scores</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              id="passport-total"
              label="Property quality"
              tip={
                "Also called Listing Score. How strong this listing looks, from 0 to 100. This is what prices the quote."
              }
            >
              <Input
                id="passport-total"
                type="number"
                min={0}
                max={100}
                value={offer.passport.total}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    passport: {
                      ...current.passport,
                      total: Number(event.target.value) || 0,
                    },
                  }))
                }
              />
            </Field>
            <Field
              id="payer-total"
              label="Payment history"
              tip={
                "Also called Payer Score. How reliably this renter has paid. Weaker history raises the fee."
              }
            >
              <Input
                id="payer-total"
                type="number"
                min={0}
                max={100}
                value={offer.tenant.scores.total}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    tenant: {
                      ...current.tenant,
                      scores: {
                        ...current.tenant.scores,
                        total: Number(event.target.value) || 0,
                      },
                    },
                  }))
                }
              />
            </Field>
            <Field
              id="market-rent"
              label="Typical nearby rent (XCG)"
              tip="What similar homes nearby usually rent for. Used only to compare with this rent."
            >
              <XcgMoneyInput
                id="market-rent"
                cents={offer.marketRentCents}
                onCents={(marketRentCents) =>
                  patch((current) => ({
                    ...current,
                    marketRentCents,
                  }))
                }
              />
            </Field>
            <Field id="features" label="Features">
              <Textarea
                id="features"
                value={offer.property.features.join(", ")}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    property: {
                      ...current.property,
                      features: event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    },
                  }))
                }
              />
            </Field>
          </CardContent>
        </Card>
      ) : null}

      {step === 5 ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quote</CardTitle>
              <CardDescription>
                Only a six-month quote under the 24% cap can be submitted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <TermPicker
                value={offer.months}
                onChange={(months) =>
                  patch((current) => ({ ...current, months }))
                }
              />
            </CardContent>
          </Card>
          {quote ? <QuoteResult quote={quote} /> : null}
        </div>
      ) : null}

      {step === 6 ? (
        <Card>
          <CardHeader>
            <CardTitle>Choose your payout</CardTitle>
            <CardDescription>
              Your sale amount is sent automatically after the whole offer is
              bought. Choose this before submitting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={offer.payout.method === "crypto"}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  offer.payout.method === "crypto"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50",
                )}
                onClick={() =>
                  patch((current) => ({
                    ...current,
                    payout: { ...current.payout, method: "crypto" },
                  }))
                }
              >
                <WalletCards className="mb-3 size-5 text-primary" aria-hidden />
                <p className="font-medium">Stablecoin address</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The buyer pays the sale amount here once the offer is
                  purchased. It is locked for this offer.
                </p>
              </button>
              <button
                type="button"
                aria-pressed={offer.payout.method === "bank"}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  offer.payout.method === "bank"
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50",
                )}
                onClick={() =>
                  patch((current) => ({
                    ...current,
                    payout: { ...current.payout, method: "bank" },
                  }))
                }
              >
                <Landmark className="mb-3 size-5 text-primary" aria-hidden />
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">Bank account</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                    Coming soon
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Planned with Girasol · additional 1.5% demo fee.
                </p>
              </button>
            </div>

            {offer.payout.method === "crypto" ? (
              <Field
                id="payout-address"
                label="Recipient address"
                hint="A checksummed Base Sepolia 0x address. It is locked for this offer; it is never shown on payer or purchaser screens."
              >
                <Input
                  id="payout-address"
                  autoComplete="off"
                  value={offer.payout.cryptoAddress ?? ""}
                  onChange={(event) =>
                    patch((current) => ({
                      ...current,
                      payout: {
                        ...current.payout,
                        cryptoAddress: event.target.value,
                      },
                    }))
                  }
                  placeholder="0x351a767a5Bbfe0EE9ca3aA246c2b6732Dc4e43D8"
                />
              </Field>
            ) : (
              <div className="space-y-4 rounded-xl bg-muted/40 p-4">
                <Alert>
                  <AlertTitle>Girasol payout preview</AlertTitle>
                  <AlertDescription>
                    These fields are visual only and are never saved or sent.
                    Use fictional details. Crypto payout is required to submit
                    this demo.
                  </AlertDescription>
                </Alert>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="bank-account-name" label="Account holder">
                    <Input
                      id="bank-account-name"
                      autoComplete="off"
                      value={bankAccountName}
                      onChange={(event) => setBankAccountName(event.target.value)}
                      placeholder="Demo Landlord"
                    />
                  </Field>
                  <Field id="bank-account-number" label="Bank account number">
                    <Input
                      id="bank-account-number"
                      autoComplete="off"
                      value={bankAccountNumber}
                      onChange={(event) => setBankAccountNumber(event.target.value)}
                      placeholder="DEMO-0000"
                    />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  Future partner:{" "}
                  <a
                    href="https://www.girasolpayments.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Girasol Payments
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  . Final fees and integration terms still require confirmation.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {step === 7 ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Review</CardTitle>
              <CardDescription>
                {offer.reference} · {offer.property.summary}. You request this
                from your Merkado account. Merkado creates the offer after
                approval. You do not connect a wallet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative aspect-[3/2] w-full max-w-sm overflow-hidden rounded-xl bg-muted">
                <PropertyCover
                  src={coverSrcFor(offer.property.type, offer.property.coverImageSrc)}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {offer.property.district} · {offer.property.type} ·{" "}
                {offer.months} months
              </p>
              <div className="rounded-xl bg-muted/50 p-3 text-sm">
                <p className="font-medium">Payout address (locked for this offer)</p>
                <p className="mt-1 text-muted-foreground">
                  {offer.payout.method === "crypto"
                    ? offer.payout.cryptoAddress
                    : "Girasol bank payout preview · Coming soon (cannot submit)"}
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3 text-sm">
                <p className="font-medium">Rent payer wallet</p>
                <p className="mt-1 break-all text-muted-foreground">
                  {offer.renterWalletAddress}
                </p>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 size-4 rounded border border-input"
                />
                I confirm these details are correct
              </label>
            </CardContent>
          </Card>
          {quote ? <QuoteResult quote={quote} /> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={step === 1 || pending}
            onClick={() => setStep((current) => Math.max(1, current - 1))}
          >
            Back
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={saveDraft}
          >
            {pending ? "Saving…" : draftSaved ? "Draft saved" : "Save draft"}
          </Button>
        </div>
        {step < 7 ? (
          <Button
            type="button"
            disabled={pending || (step === 5 && Boolean(quote?.capBreached))}
            onClick={() => {
              const issue = stepIssue(step);
              if (issue) {
                setError(issue);
                return;
              }
              setError(null);
              setStep((current) => Math.min(7, current + 1));
            }}
          >
            Continue
          </Button>
        ) : (
          <Button
            type="button"
            disabled={pending || !confirmed}
            onClick={submitForReview}
          >
            Submit request
          </Button>
        )}
      </div>
    </div>
  );
}
