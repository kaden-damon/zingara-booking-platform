import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const header = readFileSync(
  new URL("../app/components/ZingaraHeader.tsx", import.meta.url),
  "utf8",
);
const admin = readFileSync(
  new URL("../app/admin/page.tsx", import.meta.url),
  "utf8",
);

test("the main public Book navigation returns to location selection", () => {
  assert.match(header, /href: "\/",\s+label: "Book"/);
  assert.match(header, /<Link\s+href="\/book"/);
});

test("public header uses normal page flow while Admin behavior remains scoped", () => {
  assert.match(header, /isAdminRoute\s+\? `sticky top-0 z-40/);
  assert.match(header, /: "relative z-20 sm:border-transparent/);
  assert.match(header, /isAdminRoute &&\s+window\.matchMedia/);
});

test("System submenu uses the established Settings visual treatment", () => {
  const sharedContainer =
    "rounded-[2rem] border border-[#8D7A2F]/25 bg-zinc-950/70 p-2 shadow-2xl shadow-black/20";
  const sharedButton =
    "rounded-2xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] transition";

  assert.equal(admin.split(sharedContainer).length - 1 >= 2, true);
  assert.equal(admin.split(sharedButton).length - 1 >= 2, true);
  assert.match(admin, /aria-label="System sections"[\s\S]*sm:grid-cols-3/);
});

test("System labels and state behavior remain unchanged", () => {
  assert.match(admin, /id: "operations", label: "Operations"/);
  assert.match(admin, /id: "issues", label: "Issues"/);
  assert.match(admin, /id: "preferences", label: "Preferences"/);
  assert.match(admin, /onClick=\{\(\) => setActiveSystemTab\(tab\.id\)\}/);
  assert.match(admin, /aria-current=\{activeSystemTab === tab\.id \? "page"/);
});
