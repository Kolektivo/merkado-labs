import type { ReactNode } from "react";

import { HelpTip } from "@/components/help-tip";
import { SaleNotLoan } from "@/components/sale-not-loan";
import { Rate } from "@/components/money-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PLAIN } from "@/lib/rent-advance/copy";
import { formatPercent, formatXcg, FEE_FLOOR, INTERNAL_CAP } from "@/lib/rent-advance/money";
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
        <CardTitle>How the fee is calculated</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          <Line
            label="Starting fee for this term"
            value={<Rate value={quote.baseFeeRate} />}
            tip="The fee before listing quality or payment history change it."
          />
          <Line
            label="Property quality adjustment"
            value={<Rate value={quote.passportAdjustment} />}
            tip={PLAIN.listingScore}
          />
          <Line
            label="Payment history adjustment"
            value={<Rate value={quote.payerAdjustment} />}
            tip={PLAIN.payerScore}
          />
          <Line
            label="Connected-landlord extra"
            value={<Rate value={quote.relatedPartyPremium} />}
            tip={PLAIN.relatedParty}
          />
          <Line
            label="Fee floor"
            value={formatPercent(FEE_FLOOR)}
            tip="The fee never goes below this floor."
          />
          <Line label="Final fee" value={<Rate value={quote.feeRate} />} />
        </dl>
      </CardContent>
    </Card>
  );
}

export function QuoteResult({ quote }: { quote: Quote }) {
  const capHeadroom = INTERNAL_CAP - quote.effectiveAnnualised;

  if (quote.capBreached) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertTitle>This quote cannot complete</AlertTitle>
          <AlertDescription>
            The annualised comparison is{" "}
            {formatPercent(quote.effectiveAnnualised, 1)}, above the 24% cap.
            There is no override. Lower the rent, raise the scores, or turn off
            the connected-landlord extra.
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Cash the landlord would receive
            <HelpTip label="Cash the landlord would receive">{PLAIN.cashNow}</HelpTip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tracking-tight">
            {formatXcg(quote.purchasePriceCents)}
          </p>
        </CardContent>
      </Card>
      <SaleNotLoan
        netAdvance={formatXcg(quote.purchasePriceCents)}
        grossForgone={formatXcg(quote.grossReceivablesCents)}
        totalCost={formatXcg(quote.feeCents)}
        flatFee={formatPercent(quote.feeRate)}
        effective={formatPercent(quote.effectiveAnnualised, 1)}
      />
      <dl className="divide-y rounded-xl border bg-card px-4">
        <Line
          label="Total rent for these months"
          value={formatXcg(quote.grossReceivablesCents)}
          tip={PLAIN.totalRent}
        />
        <Line
          label="Fee"
          value={`${formatXcg(quote.feeCents)} · ${formatPercent(quote.feeRate)}`}
          tip={PLAIN.fee}
        />
        <Line
          label="Share paid now"
          value={formatPercent(quote.advanceRate, 1)}
          tip={PLAIN.sharePaidNow}
        />
        <Line
          label="When the landlord is paid"
          value="Once, after the offer is funded"
          tip={PLAIN.cashNow}
        />
        <Line
          label="Yearly comparison"
          value={formatPercent(quote.effectiveAnnualised, 1)}
          tip={PLAIN.yearlyComparison}
        />
        <Line
          label="24% limit"
          value={
            capHeadroom >= 0
              ? `${formatPercent(quote.effectiveAnnualised, 1)} of 24%`
              : "Above the limit"
          }
          tip={PLAIN.yearlyComparison}
        />
      </dl>
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Extra comparison figures
        </summary>
        <dl className="mt-3 divide-y">
          <Line label="Monthly comparison" value={formatPercent(quote.monthlyIrr)} />
          <Line
            label="Simple yearly comparison"
            value={formatPercent(quote.nominalAnnualised, 1)}
          />
        </dl>
      </details>
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
