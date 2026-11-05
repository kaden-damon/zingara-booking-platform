import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");

test("show calendar uses the approved compact status presentation", async () => {
  const [adminPage, bookingPage] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/book/page.tsx"),
  ]);

  assert.match(adminPage, /show\.fullShowBuyout \|\| show\.operationalStatus === "blackout"/);
  assert.match(adminPage, /label: "Buyout"/);
  assert.match(adminPage, /label: "Open"/);
  assert.match(adminPage, /label: "Sold out"/);
  assert.match(adminPage, /whitespace-nowrap rounded-md border/);
  assert.match(bookingPage, /blackout: "Buyout"/);
  assert.match(bookingPage, /"full-show-buyout": "Buyout"/);
  assert.match(bookingPage, /"special-event": "Unavailable"/);
});

test("schedule and calendar controls retain a compact responsive layout", async () => {
  const [adminPage, globalStyles] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/globals.css"),
  ]);

  assert.match(adminPage, /<details className="order-last mt-5[^"]*"/);
  assert.doesNotMatch(adminPage, /<div className="contents">\s*<details className="order-last/);
  assert.match(adminPage, /grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7/);
  assert.match(adminPage, /grid-cols-2 gap-1\.5 pr-11 2xl:grid-cols-1 2xl:pb-11 2xl:pr-0/);
  assert.match(adminPage, /inline-flex w-full min-w-0 items-center justify-center whitespace-nowrap/);
  assert.match(adminPage, /tracking-normal tabular-nums/);
  assert.match(globalStyles, /select:not\(\[multiple\]\):not\(\[size\]\):not\(\.appearance-none\)/);
  assert.match(globalStyles, /background-position: right 0\.875rem center/);
  assert.match(globalStyles, /padding-right: 2\.75rem/);
  assert.match(adminPage, />\s*Standard\s*<\/button>/);
  assert.match(adminPage, />\s*Back\s*<\/button>/);
  assert.doesNotMatch(adminPage, />\s*Back to Calendar\s*<\/button>/);
  assert.doesNotMatch(adminPage, />\s*Home\s*<\/p>[\s\S]{0,180}Today at Zingara/);
});

