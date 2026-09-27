import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { triggerDineplanActionDigestAfterReconciliation } from "./workflows/dineplanActionDigestTrigger.ts";

const client = {} as SupabaseClient;

test("trusted reconciliation with actions immediately uses the authoritative digest runner", async () => {
  let calls = 0;
  const result = await triggerDineplanActionDigestAfterReconciliation({
    actionCount: 4,
    client,
    runDigest: async () => {
      calls += 1;
      return { actionCount: 4, available: true, delivered: true, subjects: ["Digest"] };
    },
    trusted: true,
  });

  assert.equal(calls, 1);
  assert.equal(result.delivered, true);
});

test("disabled notifications and zero due actions remain no-send outcomes", async () => {
  for (const reason of ["disabled", "no_due_actions"] as const) {
    const result = await triggerDineplanActionDigestAfterReconciliation({
      actionCount: 1,
      client,
      runDigest: async () => ({ available: true, delivered: false, reason }),
      trusted: true,
    });
    assert.deepEqual(result, { available: true, delivered: false, reason });
  }
});

test("zero-action and untrusted reconciliations never invoke delivery", async () => {
  let calls = 0;
  const runDigest = async () => {
    calls += 1;
    return { available: true, delivered: true, actionCount: 1, subjects: ["Digest"] };
  };

  const zeroActions = await triggerDineplanActionDigestAfterReconciliation({
    actionCount: 0,
    client,
    runDigest,
    trusted: true,
  });
  const untrusted = await triggerDineplanActionDigestAfterReconciliation({
    actionCount: 1,
    client,
    runDigest,
    trusted: false,
  });

  assert.equal(calls, 0);
  assert.equal(zeroActions.reason, "no_actions");
  assert.equal(untrusted.reason, "untrusted");
});

test("provider failure remains retry-safe and reconciliation remains successful", async () => {
  const providerFailure = await triggerDineplanActionDigestAfterReconciliation({
    actionCount: 1,
    client,
    runDigest: async () => ({ available: true, delivered: false, reason: "provider_failed" }),
    trusted: true,
  });
  const unexpectedFailure = await triggerDineplanActionDigestAfterReconciliation({
    actionCount: 1,
    client,
    runDigest: async () => { throw new Error("provider unavailable"); },
    trusted: true,
  });

  assert.equal(providerFailure.reason, "provider_failed");
  assert.equal(unexpectedFailure.reason, "failed");
});
