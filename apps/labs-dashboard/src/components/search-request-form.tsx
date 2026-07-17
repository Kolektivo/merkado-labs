"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SearchRequestForm({ guided = false }: { guided?: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(form: HTMLFormElement) {
    setBusy(true); setMessage(null);
    const fields = new FormData(form);
    const adminSecret = String(fields.get("adminSecret") ?? "").trim();
    try {
      const response = await fetch("/api/search-requests", { method: "POST", headers: { "content-type": "application/json", "x-labs-admin-secret": adminSecret }, body: JSON.stringify({
        title: fields.get("title"), transactionType: fields.get("transactionType"), minPrice: fields.get("minPrice"), maxPrice: fields.get("maxPrice"), minBedrooms: fields.get("minBedrooms"), preferredNeighbourhoods: String(fields.get("neighbourhoods") ?? "").split(",").map((value) => value.trim()), renovationWillingness: fields.get("renovationWillingness"), notes: fields.get("notes"), intakeSource: guided ? "what_fits_me" : "direct",
      })});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Unable to create request.");
      router.push(`/match-reports/${result.id}`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create request."); }
    finally { setBusy(false); }
  }
  return <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
    <Input name="title" placeholder={guided ? "e.g. Family home search" : "Request title"} />
    <select name="transactionType" className="rounded-md border bg-background px-3 text-sm"><option value="either">Buy or rent</option><option value="sale">Buy</option><option value="rent">Rent</option></select>
    <Input name="minPrice" type="number" placeholder="Minimum budget (XCG)" />
    <Input name="maxPrice" type="number" placeholder="Maximum budget (XCG)" />
    <Input name="minBedrooms" type="number" min="0" placeholder="Minimum bedrooms" />
    <Input name="neighbourhoods" placeholder="Preferred neighbourhoods, comma-separated" />
    <select name="renovationWillingness" className="rounded-md border bg-background px-3 text-sm"><option value="unknown">Renovation willingness</option><option value="none">Move-in ready</option><option value="light">Light work</option><option value="moderate">Moderate work</option><option value="major">Major work</option></select>
    <Input name="notes" placeholder="Notes or dealbreakers" />
    <Input name="adminSecret" type="password" required placeholder="Labs admin secret" className="sm:col-span-2" />
    <div className="flex items-center gap-3 sm:col-span-2"><Button disabled={busy}>{busy ? "Creating…" : "Create draft request"}</Button>{message ? <p className="text-sm text-destructive">{message}</p> : null}</div>
  </form>;
}
