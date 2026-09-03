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
import {
  formatPercent,
  formatXcg,
  usdCentsToXcgInput,
  xcgMajorToUsdCents,
} from "@/lib/rent-advance/money";
import { quoteHref } from "@/lib/rent-advance/quote-carry";
import { priceQuote, type Quote } from "@/lib/rent-advance/pricing";
import { derivePropertyScore } from "@/lib/rent-advance/property-score";
import { useMerkadoWallet } from "@/hooks/use-merkado-wallet";
import {
  bandLabel,
  compositeScore,
  maxTermMonths,
  rentVsTypicalLabel,
} from "@/lib/rent-advance/scoring";

const MRA001 = { rent: 180000, market: 300000, listing: 89, payer: 95 };
const CHEAP = { rent: 100, market: 200, listing: 89, payer: 95 };

export function GetNowSimulator() {
  const wallet = useMerkadoWallet();
  const [rentXcg, setRentXcg] = useState(usdCentsToXcgInput(MRA001.rent));
  const [marketXcg, setMarketXcg] = useState(usdCentsToXcgInput(MRA001.market));
  const [listingScore, setListingScore] = useState(MRA001.listing);
  const [payerScore, setPayerScore] = useState(MRA001.payer);
  const [months, setMonths] = useState(6);
  const [copied, setCopied] = useState(false);

  const monthlyRentCents = xcgMajorToUsdCents(Number(rentXcg));
  const marketRentCents = xcgMajorToUsdCents(Number(marketXcg));
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
        relatedParty: false,
      });
    } catch {
      quote = null;
    }
  }

  const canUseQuote = Boolean(quote && quote.termApproved && !quote.capBreached);

  function loadPreset(preset: typeof MRA001) {
    setRentXcg(usdCentsToXcgInput(preset.rent));
    setMarketXcg(usdCentsToXcgInput(preset.market));
    setListingScore(preset.listing);
    setPayerScore(preset.payer);
    setMonths(6);
  }

  async function copyQuote() {
    if (!quote) return;
    const text = [
      `Simulator ${quote.months} months`,
      `Rent ${formatXcg(quote.monthlyRentCents)}`,
      `Upfront ${formatXcg(quote.purchasePriceCents)}`,
      `Fee ${formatPercent(quote.feeRate)} · ${formatXcg(quote.feeCents)}`,
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
              onClick={() => loadPreset(MRA001)}
            >
              Typical home
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => loadPreset(CHEAP)}
            >
              Small studio
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-rent">Monthly rent (XCG)</Label>
            <Input
              id="sim-rent"
              type="number"
              min={0}
              step="0.01"
              value={rentXcg}
              onChange={(event) => setRentXcg(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-market" className="flex items-center gap-1.5">
              Typical nearby rent (XCG)
              <HelpTip label="Typical nearby rent">{PLAIN.marketRent}</HelpTip>
            </Label>
            <Input
              id="sim-market"
              type="number"
              min={0}
              step="0.01"
              value={marketXcg}
              onChange={(event) => setMarketXcg(event.target.value)}
            />
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
            <Button type="button" variant="outline" onClick={() => void copyQuote()}>
              {copied ? "Copied" : "Copy quote"}
            </Button>
            {canUseQuote ? (
              <Button asChild>
                <Link
                  href={quoteHref({
                    rentCents: monthlyRentCents,
                    marketCents: marketRentCents,
                    listing: listingScore,
                    payer: payerScore,
                    months,
                    renterWalletAddress: wallet.address,
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
