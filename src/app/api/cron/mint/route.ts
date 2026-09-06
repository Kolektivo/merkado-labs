import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Automatic minting is intentionally disabled on Optimism Mainnet. Mints must
 * be initiated by an authenticated Admin action.
 */
export async function GET(request: Request) {
  void request;
  return NextResponse.json(
    { ok: false, error: "Automatic minting is disabled. Use Admin mint control." },
    { status: 410 },
  );
}
