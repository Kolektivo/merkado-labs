import assert from "node:assert/strict";
import test from "node:test";

import { settledApproveThenSendState } from "@/lib/pay/approve-then-send-state";

test("a pending send exposes Check status instead of allowing a resend", () => {
  assert.deepEqual(
    settledApproveThenSendState({ status: "pending", reason: "Waiting for confirmations." }),
    {
      step: "verify",
      submitted: true,
      error: null,
      pendingReason: "Waiting for confirmations.",
    },
  );
});

test("confirmed and failed outcomes settle into terminal or retry states", () => {
  assert.equal(settledApproveThenSendState({ status: "confirmed" }).step, "done");
  assert.deepEqual(settledApproveThenSendState({ status: "error", message: "Failed" }), {
    step: "idle",
    submitted: false,
    error: "Failed",
    pendingReason: null,
  });
});
