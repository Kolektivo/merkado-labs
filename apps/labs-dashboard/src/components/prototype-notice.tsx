import { FlaskConical } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function PrototypeNotice({ children }: { children?: React.ReactNode }) {
  return (
    <Alert>
      <FlaskConical className="size-4" />
      <AlertTitle>Experimental Labs prototype — not live on merkado.cw</AlertTitle>
      <AlertDescription>
        {children ??
          "No real customer account, subscription, billing, email, or production service is connected."}
      </AlertDescription>
    </Alert>
  );
}
