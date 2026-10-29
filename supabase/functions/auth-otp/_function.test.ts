// make sure the Edge Function actually parses and boots (the dashboard
// would refuse to deploy it otherwise, and a broken brace is easy to miss)
import assert from "node:assert";

const DenoStub = {
  serve(_handler) { /* no-op */ },
  env: {
    get(_k) { return ""; },
  },
};

const g = globalThis as any;
g.Deno = DenoStub;
g.FormData = globalThis.FormData;

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log("  ok   " + name); }
  else { failed++; console.log("  FAIL " + name + (extra ? "  -> " + extra : "")); }
}

console.log("\nauth-otp function\n");

// 1) the single-file build must parse and boot
try {
  await import("./single-file.ts");
  ok("single-file.ts parses and boots", true);
} catch (e: any) {
  ok("single-file.ts parses and boots", false, String(e && e.message).slice(0, 160));
}

// 2) the two-file build must parse too
try {
  await import("./index.ts");
  ok("index.ts parses and boots", true);
} catch (e: any) {
  ok("index.ts parses and boots", false, String(e && e.message).slice(0, 160));
}

// 3) the endpoints it must answer on
const src = await (await import("node:fs/promises")).readFile(
  new URL("./index.ts", import.meta.url), "utf8");
ok("handles the send action", src.includes('body.action === "send"'));
ok("handles the verify action", src.includes('body.action === "verify"'));
ok("answers OPTIONS for the browser", src.includes('req.method === "OPTIONS"'));
ok("never logs the code itself", !/console\.(log|info)\([^)]*\bcode\b(?!Hash|_hash)/i.test(src));

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
