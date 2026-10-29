// ================================================================
//  auth-otp  -  tests for the parts that must never be wrong
//  run:  node supabase/functions/auth-otp/_lib.test.ts
// ================================================================

import {
  isEmail,
  normEmail,
  hashCode,
  safeEqual,
  sixDigitString,
  CODE_TTL_MIN,
  RESEND_SECONDS,
  MAX_ATTEMPTS,
  EMAILS_PER_DAY,
} from "./_lib.ts";

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log("  ok   " + name); }
  else { failed++; console.log("  FAIL " + name + (extra ? "  -> " + extra : "")); }
}

console.log("\nauth-otp lib\n");

// ------------------------------------------------------------- email checks
ok("accepts a normal address", isEmail("fardin@example.com"));
ok("rejects an address without a domain", !isEmail("fardin@"));
ok("rejects an address without a name", !isEmail("@example.com"));
ok("rejects plain text", !isEmail("hello there"));
ok("rejects a very long address", !isEmail("a".repeat(250) + "@example.com"));
ok("normalises case and spaces", normEmail("  Fardin@Example.COM ") === "fardin@example.com");

// ------------------------------------------------------------------- hashing
const pepper = "a-very-long-random-pepper";
const code = "042317";

const h1 = await hashCode(pepper, "fardin@example.com", code);
const h2 = await hashCode(pepper, "fardin@example.com", code);
ok("the same code hashes the same way", h1 === h2);
ok("the hash is 64 hex chars", /^[0-9a-f]{64}$/.test(h1));
ok("a different code hashes differently", (await hashCode(pepper, "fardin@example.com", "042318")) !== h1);
ok("a different pepper hashes differently", (await hashCode("other-pepper", "fardin@example.com", code)) !== h1);
ok("a different address hashes differently", (await hashCode(pepper, "other@example.com", code)) !== h1);
ok("the plain code is not in the hash", !h1.includes(code));

// ------------------------------------------------------- constant time compare
ok("equal strings match", safeEqual("abc123", "abc123"));
ok("different strings do not match", !safeEqual("abc123", "abc124"));
ok("different lengths do not match", !safeEqual("abc123", "abc1234"));
ok("empty strings match", safeEqual("", ""));

// -------------------------------------------------------------- code making
const seen = new Set<string>();
let allSix = true;
for (let i = 0; i < 2000; i++) {
  const c = sixDigitString();
  if (!/^\d{6}$/.test(c)) { allSix = false; break; }
  seen.add(c);
}
ok("every code is exactly 6 digits", allSix);
ok("codes do not repeat in 2000 draws", seen.size > 1950, "unique: " + seen.size);

// ------------------------------------------------------------------ the caps
ok("the code lives for 10 minutes", CODE_TTL_MIN === 10);
ok("one code per email per minute", RESEND_SECONDS === 60);
ok("5 wrong guesses kill a code", MAX_ATTEMPTS === 5);
ok("the daily cap stays under Resend's 100/day", EMAILS_PER_DAY === 90 && EMAILS_PER_DAY < 100);

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
