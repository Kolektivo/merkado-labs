"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

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
import { saveDraftOfferAction } from "@/lib/rent-advance/actions";
import { buildScheduledReceivables } from "@/lib/rent-advance/helpers";
import { CapExceededError } from "@/lib/rent-advance/money";
import { priceOrBlock, priceQuote, type Quote } from "@/lib/rent-advance/pricing";
import type { Offer } from "@/lib/rent-advance/types";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Property" },
  { id: 2, label: "Payer" },
  { id: 3, label: "Lease" },
  { id: 4, label: "Listing Score" },
  { id: 5, label: "Quote" },
  { id: 6, label: "Review" },
] as const;

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
  const [declared, setDeclared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const quote = useMemo(() => {
    if (offer.months !== 6) return null;
    try {
      return priceQuote({
        monthlyRentCents: offer.monthlyRentCents,
        months: offer.months,
        passportScore: offer.passport.total,
        payerScore: offer.tenant.scores.total,
        relatedParty: offer.relatedParty,
      });
    } catch {
      return null;
    }
  }, [
    offer.months,
    offer.monthlyRentCents,
    offer.passport.total,
    offer.tenant.scores.total,
    offer.relatedParty,
  ]);

  function patch(updater: (current: Offer) => Offer) {
    setOffer((current) => updater(current));
  }

  function saveDraft() {
    setError(null);
    if (!declared) {
      setError("Confirm the related-party status before saving.");
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
          relatedParty: offer.relatedParty,
        });
        const next = applyQuote(offer, priced);
        await saveDraftOfferAction(next);
        router.push(`/originate/${next.reference}`);
        router.refresh();
      } catch (err) {
        if (err instanceof CapExceededError) {
          setError(err.message);
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to save draft.");
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <nav aria-label="Create offer progress">
        <ol className="grid grid-cols-3 gap-1 rounded-xl border bg-card p-1.5 sm:grid-cols-6 sm:gap-2 sm:p-2">
          {STEPS.map((item) => {
            const complete = item.id < step;
            const current = item.id === step;
            return (
              <li key={item.id} className="min-w-0">
                <button
                  type="button"
                  className={cn(
                    "flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:px-2 sm:text-sm",
                    current && "bg-foreground text-background",
                    complete && "bg-muted text-foreground hover:bg-muted/80",
                    !current && !complete && "text-muted-foreground",
                  )}
                  aria-current={current ? "step" : undefined}
                  disabled={pending}
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
        Fields are prefilled from the MRA-001 shape. Jump to Quote or Review
        if you only need the ending.
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
            <CardDescription>Prefill follows the MRA-001 shape.</CardDescription>
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
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Payer</CardTitle>
            <CardDescription>Holders never see any of this.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
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
              <Input
                id="income"
                type="number"
                min={0}
                step="0.01"
                value={offer.tenant.monthlyIncomeCents / 100}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    tenant: {
                      ...current.tenant,
                      monthlyIncomeCents: Math.round(Number(event.target.value) * 100) || 0,
                    },
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
              <Input
                id="rent"
                type="number"
                min={0}
                step="0.01"
                value={offer.monthlyRentCents / 100}
                onChange={(event) => {
                  const cents = Math.round(Number(event.target.value) * 100) || 0;
                  patch((current) => ({
                    ...current,
                    monthlyRentCents: cents,
                    lease: { ...current.lease, monthlyRentCents: cents },
                  }));
                }}
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
            <CardTitle>Listing Score</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              id="passport-total"
              label="Listing Score"
              tip="Raw property quality from 0 to 100. This is what prices the quote. Property Score is only a derived explanation."
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
              label="Payer score"
              tip="How reliably this renter has paid. Weaker history raises the fee."
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
            <Field id="market-rent" label="Market rent (XCG)">
              <Input
                id="market-rent"
                type="number"
                min={0}
                step="0.01"
                value={offer.marketRentCents / 100}
                onChange={(event) =>
                  patch((current) => ({
                    ...current,
                    marketRentCents: Math.round(Number(event.target.value) * 100) || 0,
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
                Only the six-month term can be originated. A 24% cap blocks publish.
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
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Review</CardTitle>
              <CardDescription>
                {offer.reference} · {offer.property.summary} · payer{" "}
                {offer.tenant.initials}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={offer.relatedParty}
                  onChange={(event) =>
                    patch((current) => ({
                      ...current,
                      relatedParty: event.target.checked,
                      relatedPartyNote: event.target.checked
                        ? current.relatedPartyNote ??
                          "Related-party premium applies. Independent approver required."
                        : null,
                    }))
                  }
                  className="mt-0.5 size-4 rounded border border-input"
                />
                This offer is a related-party transaction (independent approver
                required; related-party premium)
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={declared}
                  onChange={(event) => setDeclared(event.target.checked)}
                  className="mt-0.5 size-4 rounded border border-input"
                />
                I confirm the related-party status above is correct
              </label>
            </CardContent>
          </Card>
          {quote ? <QuoteResult quote={quote} /> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={step === 1 || pending}
          onClick={() => setStep((current) => Math.max(1, current - 1))}
        >
          Back
        </Button>
        {step < 6 ? (
          <Button
            type="button"
            disabled={pending || (step === 5 && Boolean(quote?.capBreached))}
            onClick={() => {
              setError(null);
              if (step === 5 && quote?.capBreached) {
                setError("The 24% cap blocks this quote.");
                return;
              }
              setStep((current) => Math.min(6, current + 1));
            }}
          >
            Continue
          </Button>
        ) : (
          <Button type="button" disabled={pending} onClick={saveDraft}>
            Save as draft
          </Button>
        )}
      </div>
    </div>
  );
}
