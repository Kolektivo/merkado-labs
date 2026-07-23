import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PrototypeNotice } from "@/components/prototype-notice";
import { WhatFitsMeFlow } from "@/components/what-fits-me-flow";

export const metadata: Metadata = { title: "What Fits Me" };

export default function WhatFitsMePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="What Fits Me"
        description="Describe what you want, review the interpreted Property Search, and see real matches from current Labs listings."
        icon={Sparkles}
      />
      <PrototypeNotice>
        Labs matching only — deterministic and explainable. Not mortgage advice,
        not live on merkado.cw, and no billing or email.
      </PrototypeNotice>
      <WhatFitsMeFlow />
    </div>
  );
}
