import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { PrototypeNotice } from "@/components/prototype-notice";
import { SearchRequestForm } from "@/components/search-request-form";

export const metadata: Metadata = { title: "What fits me" };
export default function WhatFitsMePage() {
  return <div className="space-y-6"><PageHeader title="What Fits Me?" description="Turn practical preferences into an internal draft search request." icon={Sparkles} /><PrototypeNotice>This is structured guidance only. It is not mortgage approval, affordability advice, or a customer-ready service.</PrototypeNotice><SearchRequestForm guided /></div>;
}
