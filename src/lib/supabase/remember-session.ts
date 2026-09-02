export const REMEMBER_SESSION_COOKIE = "merkado-remember-session";

export const STAY_SIGNED_IN_SESSION_KEY = "merkado-stay-signed-in";

export type CookieWriteOptions = {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  sameSite?: true | false | "lax" | "strict" | "none" | "Lax" | "Strict" | "None";
  secure?: boolean;
  httpOnly?: boolean;
  name?: string;
};

export function isRememberSessionEnabled(
  value: string | null | undefined,
): boolean {
  if (value == null || value === "") {
    return true;
  }

  return value !== "0";
}

export function applyRememberSessionCookieOptions<T extends CookieWriteOptions>(
  options: T,
  staySignedIn: boolean,
): T {
  if (staySignedIn) {
    return options;
  }

  if (options.maxAge === 0) {
    return options;
  }

  const next = { ...options };
  delete next.maxAge;
  delete next.expires;
  return next;
}

export function parseBrowserCookies(
  cookieHeader: string,
): { name: string; value: string }[] {
  if (!cookieHeader.trim()) {
    return [];
  }

  return cookieHeader
    .split("; ")
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex === -1) {
        return { name: entry, value: "" };
      }

      return {
        name: entry.slice(0, separatorIndex),
        value: entry.slice(separatorIndex + 1),
      };
    });
}

export function serializeBrowserCookie(
  name: string,
  value: string,
  options: CookieWriteOptions = {},
): string {
  const parts = [`${name}=${value}`];

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.floor(options.maxAge)}`);
  }

  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }

  if (options.path) {
    parts.push(`Path=${options.path}`);
  }

  if (options.sameSite !== undefined && options.sameSite !== false) {
    const sameSite =
      options.sameSite === true
        ? "Strict"
        : `${options.sameSite.charAt(0).toUpperCase()}${options.sameSite.slice(1).toLowerCase()}`;
    parts.push(`SameSite=${sameSite}`);
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function getRememberSessionPreferenceFromCookieHeader(
  cookieHeader: string | null | undefined,
): boolean {
  if (!cookieHeader) {
    return true;
  }

  const match = parseBrowserCookies(cookieHeader).find(
    (cookie) => cookie.name === REMEMBER_SESSION_COOKIE,
  );

  return isRememberSessionEnabled(match?.value);
}

function getSessionOnlyMirror(): boolean {
  if (typeof sessionStorage === "undefined") {
    return false;
  }

  try {
    return sessionStorage.getItem(STAY_SIGNED_IN_SESSION_KEY) === "0";
  } catch {
    return false;
  }
}

function setSessionOnlyMirror(staySignedIn: boolean): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  try {
    if (staySignedIn) {
      sessionStorage.removeItem(STAY_SIGNED_IN_SESSION_KEY);
    } else {
      sessionStorage.setItem(STAY_SIGNED_IN_SESSION_KEY, "0");
    }
  } catch {
    // Private mode / blocked storage — cookie preference remains the source of truth.
  }
}

export function getRememberSessionPreference(): boolean {
  if (getSessionOnlyMirror()) {
    return false;
  }

  if (typeof document === "undefined") {
    return true;
  }

  return getRememberSessionPreferenceFromCookieHeader(document.cookie);
}

export function setRememberSessionPreference(staySignedIn: boolean): void {
  if (typeof document === "undefined") {
    return;
  }

  const value = staySignedIn ? "1" : "0";
  const options: CookieWriteOptions = {
    path: "/",
    sameSite: "lax",
    secure: window.location.protocol === "https:",
  };

  if (staySignedIn) {
    options.maxAge = 400 * 24 * 60 * 60;
  }

  document.cookie = serializeBrowserCookie(REMEMBER_SESSION_COOKIE, value, options);
  setSessionOnlyMirror(staySignedIn);
}

export function clearRememberSessionPreference(): void {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = serializeBrowserCookie(REMEMBER_SESSION_COOKIE, "", {
    path: "/",
    sameSite: "lax",
    maxAge: 0,
    secure: window.location.protocol === "https:",
  });
  setSessionOnlyMirror(true);
}