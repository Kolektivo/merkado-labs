"use client";

import { useMemo, useState } from "react";

import { HelpTip } from "@/components/help-tip";
import { QuoteResult } from "@/components/rent-advance/quote-result";
import { TermPicker } from "@/components/rent-advance/term-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { priceQuote } from "@/lib/rent-advance/pricing";

export function GetNowSimulator() {
  const [rentGuilders, setRentGuilders] = useState("1800");
  const [relatedParty, setRelatedParty] = useState(true);
  const [passportScore, setPassportScore] = useState("89");
  const [payerScore, setPayerScore] = useState("95");
  const [months, setMonths] = useState(6);

  const monthlyRentCents = Math.round(Number(rentGuilders) * 100);

  const quote = useMemo(() => {
    if (months !== 6) return null;
    if (!Number.isInteger(monthlyRentCents) || monthlyRentCents <= 0) return null;
    try {
      return priceQuote({
        monthlyRentCents,
        months,
        passportScore: Number(passportScore) || 0,
        payerScore: Number(payerScore) || 0,
        relatedParty,
      });
    } catch {
      return null;
    }
  }, [monthlyRentCents, months, passportScore, payerScore, relatedParty]);

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
                setRelatedParty(true);
                setPassportScore("89");
                setPayerScore("95");
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
                setRelatedParty(true);
                setPassportScore("40");
                setPayerScore("40");
                setMonths(6);
              }}
            >
              Demonstrate 24% cap
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-rent">Monthly rent (XCG)</Label>
            <Input
              id="sim-rent"
              type="number"
              min={0}
              step="0.01"
              value={rentGuilders}
              onChange={(event) => setRentGuilders(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-related" className="flex items-center gap-1.5">
              Related party
              <HelpTip label="Related party">
                Extra 25 basis points when the landlord and Merkado are
                connected. An independent approver is required.
              </HelpTip>
            </Label>
            <label
              htmlFor="sim-related"
              className="flex h-8 items-center gap-2 text-sm"
            >
              <input
                id="sim-related"
                type="checkbox"
                checked={relatedParty}
                onChange={(event) => setRelatedParty(event.target.checked)}
                className="size-4 rounded border border-input"
              />
              Apply related-party premium
            </label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-passport" className="flex items-center gap-1.5">
              Passport score
              <HelpTip label="Passport score">
                Property quality from 0 to 100. Weaker properties raise the
                fee.
              </HelpTip>
            </Label>
            <Input
              id="sim-passport"
              type="number"
              min={0}
              max={100}
              value={passportScore}
              onChange={(event) => setPassportScore(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sim-payer" className="flex items-center gap-1.5">
              Payer score
              <HelpTip label="Payer score">
                How reliably this renter has paid, from 0 to 100. Weaker
                history raises the fee.
              </HelpTip>
            </Label>
            <Input
              id="sim-payer"
              type="number"
              min={0}
              max={100}
              value={payerScore}
              onChange={(event) => setPayerScore(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-medium">Term</p>
        <TermPicker value={months} onChange={setMonths} />
      </div>

      {quote ? (
        <QuoteResult quote={quote} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Choose the six-month term to see what the landlord would receive
          today.
        </p>
      )}
    </div>
  );
}
