import assert from "node:assert/strict";
import test from "node:test";
import { chunkReviewAnalyticsIds } from "./reviewAnalyticsServer";

test("review analytics batches large ID filters without loss or duplication", () => {
  const ids = Array.from({ length: 251 }, (_, index) => `show-${index}`);
  const batches = chunkReviewAnalyticsIds(ids);

  assert.deepEqual(
    batches.map((batch) => batch.length),
    [100, 100, 51],
  );
  assert.deepEqual(batches.flat(), ids);
});
