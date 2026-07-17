import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SearchRequestForm } from "@/components/search-request-form";

export const metadata: Metadata = { title: "What fits me" };
export default function WhatFitsMePage() {
  return <div className="space-y-6"><PageHeader title="What fits me" description="Turn a few practical preferences into a draft search request. Matching runs later through the Python CLI." icon={Sparkles} /><SearchRequestForm guided /></div>;
}
