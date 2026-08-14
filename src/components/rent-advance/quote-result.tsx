import type { ReactNode } from "react";

import { HelpTip } from "@/components/help-tip";
import { SaleNotLoan } from "@/components/sale-not-loan";
import { Rate } from "@/components/money-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercent, formatXcg, FEE_FLOOR } from "@/lib/rent-advance/money";
import type { Quote } from "@/lib/rent-advance/pricing";

function Line({
  label,
  value,
  tip,
}: {
  label: string;
  value: ReactNode;
  tip?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        {label}
        {tip ? <HelpTip label={label}>{tip}</HelpTip> : null}
      </dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function FeeBuildup({ quote }: { quote: Quote }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fee build-up</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          <Line
            label="Base"
            value={<Rate value={quote.baseFeeRate} />}
            tip="Starting fee before property or payer adjustments."
          />
          <Line
            label="Passport adjustment"
            value={<Rate value={quote.passportAdjustment} />}
            tip="Property quality grade. Weaker properties cost more."
          />
          <Line
            label="Payer adjustment"
            value={<Rate value={quote.payerAdjustment} />}
            tip="How reliably this renter has paid. Weaker history costs more."
          />
          <Line
            label="Related-party premium"
            value={<Rate value={quote.relatedPartyPremium} />}
            tip="Extra 25 basis points when the landlord and Merkado are connected."
          />
          <Line
            label="Floor"
            value={formatPercent(FEE_FLOOR)}
            tip="The fee never goes below this floor."
          />
          <Line label="Fee rate" value={<Rate value={quote.feeRate} />} />
        </dl>
      </CardContent>
    </Card>
  );
}

export function QuoteResult({ quote }: { quote: Quote }) {
  if (quote.capBreached) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTitle>This quote cannot complete</AlertTitle>
          <AlertDescription>
            The annualised comparison is{" "}
            {formatPercent(quote.effectiveAnnualised, 1)}, above the 24% cap.
            Lower the rent, raise the scores, or drop the related-party
            premium.
          </AlertDescription>
        </Alert>
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Why the fee reached the cap
          </summary>
          <div className="mt-3">
            <FeeBuildup quote={quote} />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SaleNotLoan
        netAdvance={formatXcg(quote.purchasePriceCents)}
        grossForgone={formatXcg(quote.grossReceivablesCents)}
        totalCost={formatXcg(quote.feeCents)}
        flatFee={formatPercent(quote.feeRate)}
        effective={formatPercent(quote.effectiveAnnualised, 1)}
      />
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          How the fee is built
        </summary>
        <div className="mt-3">
          <FeeBuildup quote={quote} />
        </div>
      </details>
    </div>
  );
}
