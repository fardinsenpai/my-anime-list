// ================================================================
//  auth-otp  -  the parts worth testing on their own
//  (Deno for the Edge Function, Node for the test runner)
// ================================================================

export const CODE_TTL_MIN = 10;      // how long a code stays usable
export const RESEND_SECONDS = 60;    // "one code per email per minute"
export const EMAIL_PER_HOUR = 5;     // per email address
export const IP_PER_HOUR = 10;       // per ip address
export const EMAILS_PER_DAY = 90;    // global cap, stays under Resend's 100/day
export const MAX_ATTEMPTS = 5;       // wrong guesses before the code dies

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

export function isEmail(v: unknown): boolean {
  const e = normEmail(v);
  return EMAIL_RE.test(e) && e.length <= 254;
}

// sha256(pepper:email:code) -> hex. The pepper lives in the secrets, so a
// stolen table is useless on its own.
export async function hashCode(pepper: string, email: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${pepper}:${email}:${code}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// compare without leaking where the difference is
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// a 6 digit code from a crypto source (not Math.random)
export function sixDigits(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % 1000000;
}

export function sixDigitString(): string {
  return String(sixDigits()).padStart(6, "0");
}
