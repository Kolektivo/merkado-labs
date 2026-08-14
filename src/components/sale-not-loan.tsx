import { HelpTip } from "@/components/help-tip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  EFFECTIVE_RATE_PLAIN,
  NO_OTHER_CHARGE,
  NON_RECOURSE,
  SALE_NOT_LOAN,
} from "@/lib/rent-advance/copy";

export function SaleNotLoan({
  netAdvance,
  grossForgone,
  totalCost,
  flatFee,
  effective,
}: {
  netAdvance: string;
  grossForgone: string;
  totalCost: string;
  flatFee: string;
  effective: string;
}) {
  return (
    <Alert>
      <AlertTitle className="flex items-center gap-2">
        Sale of rent receivables — not a loan
        <HelpTip label="Sale, not a loan">
          {SALE_NOT_LOAN} {NO_OTHER_CHARGE} {NON_RECOURSE}
        </HelpTip>
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          You receive <strong>{netAdvance}</strong> today. You forgo{" "}
          <strong>{grossForgone}</strong> of rent over the term. Fee{" "}
          <strong>{totalCost}</strong> ({flatFee} flat).
        </p>
        <p className="flex flex-wrap items-center gap-1.5">
          Effective annualised comparison: <strong>{effective}</strong>
          <HelpTip label="Effective annualised">{EFFECTIVE_RATE_PLAIN}</HelpTip>
        </p>
      </AlertDescription>
    </Alert>
  );
}
