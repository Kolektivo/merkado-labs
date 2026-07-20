import "server-only";

const WINDOW_MS = 60_000;
const MAX_POSTS_PER_WINDOW = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

export class PipelineRequestGuardError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PipelineRequestGuardError";
  }
}

export function assertPipelinePostAllowed(request: Request): void {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const sameOrigin =
    origin === expectedOrigin ||
    (referer !== null && referer.startsWith(`${expectedOrigin}/`));
  if (!sameOrigin) {
    throw new PipelineRequestGuardError("Cross-site pipeline request rejected", 403);
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || request.headers.get("user-agent") || "unknown";
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  if (current.count >= MAX_POSTS_PER_WINDOW) {
    throw new PipelineRequestGuardError(
      "Too many pipeline requests; retry in one minute",
      429,
    );
  }
  current.count += 1;
}
