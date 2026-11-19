/** Shared dashboard auth helpers (Edge + Node safe via Web Crypto). */

export const AUTH_COOKIE = "td_auth";
export const AUTH_MESSAGE = "track-dashboard-session-v1";
export const AUTH_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toHex(sig);
}

export function getDashboardPassword(): string {
  return (process.env.DASHBOARD_PASSWORD || "").trim();
}

export async function makeSessionToken(password: string): Promise<string> {
  return hmacSha256Hex(password, AUTH_MESSAGE);
}

export async function verifySessionToken(token: string | undefined | null, password: string): Promise<boolean> {
  if (!token || !password) return false;
  const expected = await makeSessionToken(password);
  if (token.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export function authCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: AUTH_MAX_AGE_SEC,
  };
}
