import assert from "node:assert/strict";
import test from "node:test";

import {
  emailOnAdminAllowlist,
  parseAdminEmails,
  passesAdminEmailGateWithConfig,
} from "@/lib/auth/admin-access";

test("ADMIN_EMAILS parsing normalizes comma-separated emails", () => {
  assert.deepEqual(
    parseAdminEmails(" Admin@Example.com, , another@example.com "),
    ["admin@example.com", "another@example.com"],
  );
});

test("admin access fails closed without an allowlist", () => {
  assert.equal(
    passesAdminEmailGateWithConfig({
      email: "admin@example.com",
      allowlist: [],
      isProduction: false,
    }),
    false,
  );
  assert.equal(emailOnAdminAllowlist("admin@example.com", []), false);
});

test("admin access requires an email on the normalized allowlist", () => {
  const allowlist = parseAdminEmails("admin@example.com");
  assert.equal(emailOnAdminAllowlist(" ADMIN@EXAMPLE.COM ", allowlist), true);
  assert.equal(emailOnAdminAllowlist("other@example.com", allowlist), false);
  assert.equal(
    passesAdminEmailGateWithConfig({
      email: "admin@example.com",
      allowlist,
      isProduction: true,
    }),
    true,
  );
});
