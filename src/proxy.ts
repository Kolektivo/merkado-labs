import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  DEMO_GATE_COOKIE,
  DEMO_GATE_PATH,
  getDemoGateState,
  isValidGateCookie,
  shouldAllowUngatedPath,
} from "@/lib/demo-gate";
import { readSignedWalletSession } from "@/lib/wallet/session-cookie";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (shouldAllowUngatedPath(pathname)) {
    return NextResponse.next();
  }

  const state = getDemoGateState();
  if (!state.active) {
    return NextResponse.next();
  }

  let walletSession = false;
  try {
    walletSession = Boolean(
      readSignedWalletSession(
        request.cookies.get("merkado_wallet_session")?.value,
        request.headers.get("host") ?? "",
      ),
    );
  } catch {
    walletSession = false;
  }
  const demoUnlocked =
    !state.active ||
    isValidGateCookie(request.cookies.get(DEMO_GATE_COOKIE)?.value, state.password);
  if (demoUnlocked && walletSession) {
    return NextResponse.next();
  }

  const enter = request.nextUrl.clone();
  enter.pathname = DEMO_GATE_PATH;
  enter.search = "";
  const nextPath = `${pathname}${search}`;
  if (nextPath && nextPath !== "/") {
    enter.searchParams.set("next", nextPath);
  }
  return NextResponse.redirect(enter);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
