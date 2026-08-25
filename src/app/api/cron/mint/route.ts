import { NextResponse } from "next/server";

import { runPendingMintSweep } from "@/lib/rent-advance/mint-sweep-run";

export const dynamic = "force-dynamic";

/**
 * Background mint sweep, triggered by a Vercel cron. Protected by CRON_SECRET
 * so the demo-password gate is not required (the cron has no cookie).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPendingMintSweep();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Sweep failed" },
      { status: 500 },
    );
  }
}
