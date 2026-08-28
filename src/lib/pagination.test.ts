import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's built-in TypeScript test runner requires the extension.
import {
  defaultPageSize,
  getPaginationWindow,
  paginateItems,
  parsePageSize,
  resetPageForCriteriaChange,
} from "./pagination.ts";

test("page-size validation accepts only whole values from 1 through 250", () => {
  assert.equal(parsePageSize("1"), 1);
  assert.equal(parsePageSize("25"), 25);
  assert.equal(parsePageSize("250"), 250);
  assert.equal(parsePageSize("0"), null);
  assert.equal(parsePageSize("251"), null);
  assert.equal(parsePageSize("2.5"), null);
  assert.equal(parsePageSize("not-a-number"), null);
});

test("pagination calculates page totals and clamps out-of-range pages", () => {
  assert.deepEqual(getPaginationWindow(51, 99, 25), {
    end: 51,
    page: 3,
    pageCount: 3,
    sliceEnd: 51,
    sliceStart: 50,
    start: 51,
    total: 51,
  });

  assert.equal(getPaginationWindow(0, 1, defaultPageSize).pageCount, 1);
});

test("pages contain every row exactly once with no duplicates", () => {
  const rows = Array.from({ length: 137 }, (_, index) => `booking-${index + 1}`);
  const pageCount = getPaginationWindow(rows.length, 1, 25).pageCount;
  const visibleRows = Array.from({ length: pageCount }, (_, index) =>
    paginateItems(rows, index + 1, 25).items,
  ).flat();

  assert.deepEqual(visibleRows, rows);
  assert.equal(new Set(visibleRows).size, rows.length);
});

test("criteria changes reset the page while preserving page size", () => {
  assert.deepEqual(resetPageForCriteriaChange(100), {
    page: 1,
    pageSize: 100,
  });
});
