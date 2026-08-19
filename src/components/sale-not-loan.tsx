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
  received = false,
}: {
  netAdvance: string;
  grossForgone: string;
  totalCost: string;
  flatFee: string;
  effective: string;
  received?: boolean;
}) {
  return (
    <Alert>
      <AlertTitle className="flex items-center gap-2">
        This is a sale of future rent — not a loan
        <HelpTip label="Sale, not a loan">
          {SALE_NOT_LOAN} {NO_OTHER_CHARGE} {NON_RECOURSE}
        </HelpTip>
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          {received ? "The landlord received" : "The landlord would receive"}{" "}
          <strong>{netAdvance}</strong>
          {received ? " as a one-time settlement." : " today if this is funded."}{" "}
          Later rent of <strong>{grossForgone}</strong> goes to holders, not
          back to the landlord. Fee <strong>{totalCost}</strong> ({flatFee}{" "}
          flat).
        </p>
        <p className="flex flex-wrap items-center gap-1.5">
          Effective annualised comparison: <strong>{effective}</strong>
          <HelpTip label="Effective annualised">{EFFECTIVE_RATE_PLAIN}</HelpTip>
        </p>
      </AlertDescription>
    </Alert>
  );
}
