import assert from "node:assert/strict";
import test from "node:test";

import {
  cookieValueForPassword,
  getDemoGateState,
  isValidGateCookie,
  passwordsMatch,
  safeReturnPath,
  shouldAllowUngatedPath,
} from "@/lib/demo-gate";

test("local and CI stay open when no host password is set", () => {
  const state = getDemoGateState({});
  assert.equal(state.active, false);
  assert.equal(state.configured, false);
});

test("a configured password activates the host gate", () => {
  const state = getDemoGateState({ LABS_DEMO_PASSWORD: " walkthrough " });
  assert.equal(state.active, true);
  assert.equal(state.configured, true);
  assert.equal(state.password, "walkthrough");
});

test("hosted production stays locked if the password is missing", () => {
  const state = getDemoGateState({ VERCEL_ENV: "production" });
  assert.equal(state.active, true);
  assert.equal(state.configured, false);
  assert.equal(state.hostedProduction, true);
});

test("password comparison accepts the correct value and rejects others", () => {
  assert.equal(passwordsMatch("walkthrough", "walkthrough"), true);
  assert.equal(passwordsMatch("Walkthrough", "walkthrough"), false);
  assert.equal(passwordsMatch("", "walkthrough"), false);
});

test("the unlock cookie only matches the current password", () => {
  const cookie = cookieValueForPassword("walkthrough");
  assert.equal(isValidGateCookie(cookie, "walkthrough"), true);
  assert.equal(isValidGateCookie(cookie, "other"), false);
  assert.equal(isValidGateCookie(undefined, "walkthrough"), false);
  assert.equal(isValidGateCookie(cookie, ""), false);
});

test("return paths stay inside the demo", () => {
  assert.equal(safeReturnPath("/originate"), "/originate");
  assert.equal(safeReturnPath("/pay?x=1"), "/pay?x=1");
  assert.equal(safeReturnPath("https://evil.example"), "/");
  assert.equal(safeReturnPath("//evil.example"), "/");
  assert.equal(safeReturnPath("/\\evil.example"), "/");
  assert.equal(safeReturnPath("/enter"), "/");
  assert.equal(safeReturnPath("/enter/extra"), "/");
  assert.equal(safeReturnPath(""), "/");
});

test("the password page and static files stay reachable", () => {
  assert.equal(shouldAllowUngatedPath("/enter"), true);
  assert.equal(shouldAllowUngatedPath("/_next/static/chunk.js"), true);
  assert.equal(shouldAllowUngatedPath("/cw-logo.png"), true);
  assert.equal(shouldAllowUngatedPath("/"), false);
  assert.equal(shouldAllowUngatedPath("/originate"), false);
});
