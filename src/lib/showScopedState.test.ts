import assert from "node:assert/strict";
import test from "node:test";

import { replaceShowScopedRows } from "./showScopedState.ts";

test("show refresh replaces requested and returned identifier aliases", () => {
  const result = replaceShowScopedRows(
    [
      { id: "old-display", showId: "display-show" },
      { id: "old-authoritative", showId: "authoritative-show" },
      { id: "other-show", showId: "other-show" },
    ],
    [{ id: "fresh", showId: "display-show" }],
    ["authoritative-show"],
  );

  assert.deepEqual(result, [
    { id: "other-show", showId: "other-show" },
    { id: "fresh", showId: "display-show" },
  ]);
});

test("show refresh preserves rows belonging to independent performances", () => {
  const current = [
    { id: "show-a-table", showId: "show-a" },
    { id: "show-b-table", showId: "show-b" },
  ];

  assert.deepEqual(
    replaceShowScopedRows(
      current,
      [{ id: "show-a-refreshed", showId: "show-a" }],
      ["show-a"],
    ),
    [
      { id: "show-b-table", showId: "show-b" },
      { id: "show-a-refreshed", showId: "show-a" },
    ],
  );
});
