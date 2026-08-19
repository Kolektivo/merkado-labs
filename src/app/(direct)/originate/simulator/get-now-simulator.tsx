"use client";

import { useState } from "react";
import Link from "next/link";

import { HelpTip } from "@/components/help-tip";
import { QuoteResult } from "@/components/rent-advance/quote-result";
import { TermPicker } from "@/components/rent-advance/term-picker";
import { ScoreSlider } from "@/components/score-slider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLAIN } from "@/lib/rent-advance/copy";
import { formatPercent } from "@/lib/rent-advance/money";
import { priceQuote, type Quote } from "@/lib/rent-advance/pricing";
import { derivePropertyScore } from "@/lib/rent-advance/property-score";
import {
  bandLabel,
  compositeScore,
  maxTermMonths,
  rentVsTypicalLabel,
} from "@/lib/rent-advance/scoring";

function quoteHref(input: {
  rent: number;
  market: number;
  listing: number;
  payer: number;
  related: boolean;
  months: number;
}) {
  const params = new URLSearchParams({
    quote: "1",
    rent: String(input.rent),
    market: String(input.market),
    listing: String(input.listing),
    payer: String(input.payer),
    related: input.related ? "1" : "0",
    months: String(input.months),
  });
  return `/originate/new?${params.toString()}`;
}

export function GetNowSimulator() {
  const [rentGuilders, setRentGuilders] = useState("1800");
  const [marketGuilders, setMarketGuilders] = useState("3000");
  const [relatedParty, setRelatedParty] = useState(true);
  const [listingScore, setListingScore] = useState(89);
  const [payerScore, setPayerScore] = useState(95);
  const [months, setMonths] = useState(6);
  const [copied, setCopied] = useState(false);

  const monthlyRentCents = Math.round(Number(rentGuilders) * 100);
  const marketRentCents = Math.round(Number(marketGuilders) * 100);
  const rentValid = Number.isInteger(monthlyRentCents) && monthlyRentCents > 0;

  const derived = derivePropertyScore(listingScore, monthlyRentCents, marketRentCents);
  const composite = compositeScore(listingScore, payerScore);
  const maxTerm = maxTermMonths(composite);

  let quote: Quote | null = null;
  if (months !== 3 && rentValid) {
    try {
      quote = priceQuote({
        monthlyRentCents,
        months,
        passportScore: listingScore,
        payerScore,
        relatedParty,
      });
    } catch {
      quote = null;
    }
  }

  const canUseQuote = Boolean(quote && quote.termApproved && !quote.capBreached);

  async function copyQuote() {
    if (!quote) return;
    const text = [
      `Get Now ${quote.months} months`,
      `Rent $${(quote.monthlyRentCents / 100).toFixed(2)}`,
      `Upfront $${(quote.purchasePriceCents / 100).toFixed(2)}`,
      `Fee ${formatPercent(quote.feeRate)} · $${(quote.feeCents / 100).toFixed(2)}`,
      `Effective ${formatPercent(quote.effectiveAnnualised, 1)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Inputs</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setRentGuilders("1800");
                setMarketGuilders("3000");
                setRelatedParty(true);
                setListingScore(89);
                setPayerScore(95);
                setMonths(6);
              }}
            >
              Load MRA-001
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setRentGuilders("1800");
                setMarketGuilders("3000");
                setRelatedParty(true);
                setListingScore(40);
                setPayerScore(40);
                setMonths(6);
              }}
            >
              Demonstrate 24% cap
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-rent">Monthly rent (USD)</Label>
            <Input
              id="sim-rent"
              type="number"
              min={0}
              step={50}
              value={rentGuilders}
              onChange={(event) => setRentGuilders(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-market" className="flex items-center gap-1.5">
              Typical nearby rent (USD)
              <HelpTip label="Typical nearby rent">{PLAIN.marketRent}</HelpTip>
            </Label>
            <Input
              id="sim-market"
              type="number"
              min={0}
              step={50}
              value={marketGuilders}
              onChange={(event) => setMarketGuilders(event.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sim-related" className="flex items-center gap-1.5">
              Landlord connected to Merkado
              <HelpTip label="Landlord connected to Merkado">
                {PLAIN.relatedParty}
              </HelpTip>
            </Label>
            <label htmlFor="sim-related" className="flex min-h-10 items-center gap-2 text-sm">
              <input
                id="sim-related"
                type="checkbox"
                checked={relatedParty}
                onChange={(event) => setRelatedParty(event.target.checked)}
                className="size-4 rounded border border-input"
              />
              Landlord is connected to Merkado
            </label>
          </div>
          <ScoreSlider
            id="sim-listing"
            label="Property quality"
            value={listingScore}
            onChange={setListingScore}
            tip={PLAIN.listingScore}
          />
          <ScoreSlider
            id="sim-payer"
            label="Payment history"
            value={payerScore}
            onChange={setPayerScore}
            tip={PLAIN.payerScore}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <SummaryFact
            label="Rent vs typical rent"
            tip={
              derived.marketDataAvailable
                ? PLAIN.rentVsTypical
                : "Typical rent is missing, so the combined property view is less certain."
            }
            value={rentVsTypicalLabel(derived.rentToMarketRatio)}
          />
          <SummaryFact
            label="Combined property view"
            tip={PLAIN.propertyScore}
            value={`${derived.propertyScore} · ${bandLabel(derived.propertyScore)}`}
          />
          <SummaryFact
            label="Longest term this file can use"
            tip={PLAIN.longestTerm}
            value={`${maxTerm} months`}
          />
          <SummaryFact
            label="Share paid to the landlord now"
            tip={PLAIN.sharePaidNow}
            value={quote ? formatPercent(quote.advanceRate, 1) : "—"}
          />
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-medium">Term</p>
        <TermPicker value={months} onChange={setMonths} allowSimulation />
      </div>

      {quote ? (
        <div className="space-y-4">
          <QuoteResult quote={quote} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={copyQuote}>
              {copied ? "Copied" : "Copy quote"}
            </Button>
            {canUseQuote ? (
              <Button asChild>
                <Link
                  href={quoteHref({
                    rent: Number(rentGuilders),
                    market: Number(marketGuilders),
                    listing: listingScore,
                    payer: payerScore,
                    related: relatedParty,
                    months,
                  })}
                >
                  Use this quote
                </Link>
              </Button>
            ) : (
              <Button type="button" disabled>
                Use this quote
              </Button>
            )}
          </div>
          {!canUseQuote ? (
            <p className="text-sm text-muted-foreground">
              {quote.capBreached
                ? "This quote is above the 24% cap and cannot be saved."
                : "Only the approved six-month term can create an offer."}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {rentValid
            ? "Choose how many months to sell to see the cash the landlord would receive. Three months stays unavailable."
            : "Enter a monthly rent above zero."}
        </p>
      )}
    </div>
  );
}

function SummaryFact({
  label,
  value,
  tip,
}: {
  label: string;
  value: string;
  tip: string;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1.5 text-muted-foreground">
        {label}
        <HelpTip label={label}>{tip}</HelpTip>
      </p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
