import { FlaskConical } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function PrototypeNotice({ children }: { children?: React.ReactNode }) {
  return (
    <Alert>
      <FlaskConical className="size-4" />
      <AlertTitle>Prototype · not live on merkado.cw</AlertTitle>
      <AlertDescription>
        {children ??
          "Not live on merkado.cw. No customer account, billing, email, or production service is connected."}
      </AlertDescription>
    </Alert>
  );
}
