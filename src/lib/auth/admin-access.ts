export function parseAdminEmails(raw: string | null | undefined): string[] {
  return (
    raw
      ?.split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean) ?? []
  );
}

export function emailOnAdminAllowlist(
  email: string | null | undefined,
  allowlist: string[],
): boolean {
  if (!email || allowlist.length === 0) {
    return false;
  }
  return allowlist.includes(email.trim().toLowerCase());
}

export function passesAdminEmailGateWithConfig(options: {
  email: string | null | undefined;
  allowlist: string[];
  isProduction: boolean;
}): boolean {
  const { email, allowlist } = options;

  if (allowlist.length === 0) return false;

  return emailOnAdminAllowlist(email, allowlist);
}
