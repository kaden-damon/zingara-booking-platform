import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("public booking loads shows and venue settings from public endpoints", async () => {
  const page = await source("../app/book/page.tsx");
  const shows = await source("./supabase/shows.ts");
  const settings = await source("./supabase/venueSettings.ts");

  assert.match(page, /getPublicShows\(\)/);
  assert.match(page, /getPublicVenueSettings\(\)/);
  assert.match(shows, /fetch\("\/api\/shows"/);
  assert.match(settings, /fetch\("\/api\/venue-settings"/);
  assert.doesNotMatch(page, /getShowsWithTables\(\{ metadataOnly: true \}\)/);
});

test("public booking metadata routes are GET-only", async () => {
  for (const path of [
    "../app/api/shows/route.ts",
    "../app/api/venue-settings/route.ts",
  ]) {
    const route = await source(path);
    assert.match(route, /export async function GET/);
    assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
  }
});

test("public show metadata does not expose internal show notes", async () => {
  const route = await source("../app/api/shows/route.ts");

  assert.doesNotMatch(route, /internalNotes/);
  assert.match(route, /id,name,description,date,time,venue,status,notes,updated_at/);
});

test("Admin show and venue-setting reads remain staff protected", async () => {
  for (const path of [
    "../app/api/admin/shows/route.ts",
    "../app/api/admin/venue-settings/route.ts",
  ]) {
    const route = await source(path);
    const getHandler = route.slice(route.indexOf("export async function GET"));
    assert.match(getHandler, /requireActiveStaff\(request\)/);
  }
});

test("calendar loading is independent from optional cookie consent", async () => {
  const page = await source("../app/book/page.tsx");
  const loadStart = page.indexOf("async function loadShowInventory");
  const loadEnd = page.indexOf("const hydrationTimer", loadStart);
  const loader = page.slice(loadStart, loadEnd);

  assert.match(loader, /getPublicShows\(\)/);
  assert.doesNotMatch(loader, /hasAnalyticsConsent|hasMarketingConsent|cookie/i);
});

test("Retry reissues the show inventory request", async () => {
  const page = await source("../app/book/page.tsx");

  assert.match(page, /setShowLoadRetryToken\(\(currentToken\) => currentToken \+ 1\)/);
  assert.match(page, /\}, \[showLoadRetryToken\]\);/);
});
