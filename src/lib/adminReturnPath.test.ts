import assert from "node:assert/strict";
import test from "node:test";

import {
  getAdminLoginPath,
  sanitizeAdminReturnPath,
} from "./adminReturnPath.ts";

test("preserves safe Admin paths, queries, and ordinary fragments", () => {
  assert.equal(
    sanitizeAdminReturnPath("/admin/quick-start?section=floor#guide"),
    "/admin/quick-start?section=floor#guide",
  );
  assert.equal(
    sanitizeAdminReturnPath("/admin?section=floor&booking=DP-TEST"),
    "/admin?section=floor&booking=DP-TEST",
  );
});

test("removes authentication-sensitive return parameters", () => {
  assert.equal(
    sanitizeAdminReturnPath(
      "/admin/quick-start?section=floor&code=secret&access_token=secret#access_token=secret",
    ),
    "/admin/quick-start?section=floor",
  );
});

test("rejects external, protocol-relative, malformed, and non-Admin paths", () => {
  for (const candidate of [
    "https://example.com/admin",
    "//example.com/admin",
    "/\\example.com/admin",
    "/book",
    "javascript:alert(1)",
  ]) {
    assert.equal(sanitizeAdminReturnPath(candidate), "/admin");
  }
});

test("uses the Admin fallback for missing or invalid destinations", () => {
  assert.equal(sanitizeAdminReturnPath(), "/admin");
  assert.equal(getAdminLoginPath(), "/admin");
  assert.equal(getAdminLoginPath("https://example.com/admin"), "/admin");
});

test("carries a deep link through the Entry Gate and Admin login layers", () => {
  const entryGateDestination = "/admin/quick-start?role=host";
  const loginPath = getAdminLoginPath(entryGateDestination);
  const encodedReturnPath = new URL(loginPath, "https://book.zingara.co.za")
    .searchParams.get("returnTo");

  assert.equal(
    loginPath,
    "/admin?returnTo=%2Fadmin%2Fquick-start%3Frole%3Dhost",
  );
  assert.equal(
    sanitizeAdminReturnPath(encodedReturnPath),
    entryGateDestination,
  );
});
