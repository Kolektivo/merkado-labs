import type { ReactNode } from "react";

import { HelpTip } from "@/components/help-tip";
import { Rate } from "@/components/money-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PLAIN } from "@/lib/rent-advance/copy";
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
  if (quote.capBreached) {
    return (
      <Alert variant="destructive">
        <AlertTitle>This quote cannot complete</AlertTitle>
        <AlertDescription>
          This quote is above the 24% cap. Lower the rent or raise the
          scores. There is no override.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Cash the landlord can claim
            <HelpTip label="Paid to the landlord">{PLAIN.cashNow}</HelpTip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tracking-tight">
            {formatXcg(quote.purchasePriceCents)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            After a holder buys the offer, the landlord claims this amount.
            No wallet is needed to request the offer.
          </p>
        </CardContent>
      </Card>
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
      </dl>
    </div>
  );
}
