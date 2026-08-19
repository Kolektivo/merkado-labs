import { HelpTip } from "@/components/help-tip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ContributeGate() {
  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" disabled>
        Subscribe · closed
      </Button>
      <Alert>
        <AlertTitle className="flex items-center gap-2">
          Subscribe is closed
          <HelpTip label="Why subscribe is closed">
            Counsel has not closed M.1.2 (what this instrument is) or M.1.4
            (whether a public holder product needs a licence). This button
            cannot complete a purchase.
          </HelpTip>
        </AlertTitle>
        <AlertDescription>
          Nobody can buy a position from this page. The button stays closed on
          purpose.
        </AlertDescription>
      </Alert>
    </div>
  );
}
