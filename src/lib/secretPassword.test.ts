import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveScheduledSecretPassword,
  type SecretPasswordSchedule,
} from "./secretPasswordResolution.ts";

const show = { date: "2026-09-11", id: "show-cpt", time: "18:00" };

const configuration = { enabled: true, heading: "Tonight's Secret Password", instruction: "Whisper this to the doorman when you arrive." };

function schedule(overrides: Partial<SecretPasswordSchedule> = {}): SecretPasswordSchedule {
  return {
    enabled: true,
    endDate: "2026-09-11",
    endTime: null,
    id: "schedule-date",
    phrase: "Velvet Moon",
    scopeType: "date",
    showId: null,
    startDate: "2026-09-11",
    startTime: null,
    updatedAt: "2026-09-10T10:00:00Z",
    venueLocation: "cape-town",
    ...overrides,
  };
}

test("disabled venue resolves no password", () => {
  assert.equal(resolveScheduledSecretPassword({ configuration: { ...configuration, enabled: false }, show, schedules: [schedule()], venueLocation: "cape-town" }), null);
});

test("daily and date-range schedules resolve within SAST show boundaries", () => {
  assert.equal(resolveScheduledSecretPassword({ configuration, show, schedules: [schedule()], venueLocation: "cape-town" })?.phrase, "Velvet Moon");
  assert.equal(resolveScheduledSecretPassword({ configuration, show, schedules: [schedule({ id: "range", scopeType: "range", startDate: "2026-09-08", endDate: "2026-09-14", startTime: "17:00", endTime: "23:59" })], venueLocation: "cape-town" })?.scheduleId, "range");
});

test("specific performance override wins over a general schedule", () => {
  const resolved = resolveScheduledSecretPassword({
    configuration,
    show,
    schedules: [schedule(), schedule({ id: "override", phrase: "The Golden Key", scopeType: "show", showId: show.id })],
    venueLocation: "cape-town",
  });
  assert.equal(resolved?.phrase, "The Golden Key");
  assert.equal(resolved?.scheduleId, "override");
});

test("venue isolation, no match, disabled entry and time window fail closed", () => {
  for (const candidate of [
    schedule({ venueLocation: "johannesburg" }),
    schedule({ startDate: "2026-09-12", endDate: "2026-09-12" }),
    schedule({ enabled: false }),
    schedule({ startTime: "19:00", endTime: "23:00" }),
  ]) {
    assert.equal(resolveScheduledSecretPassword({ configuration, show, schedules: [candidate], venueLocation: "cape-town" }), null);
  }
});

test("future schedule edits resolve their latest authoritative phrase", () => {
  assert.equal(resolveScheduledSecretPassword({ configuration, show, schedules: [schedule({ phrase: "Midnight Rose", updatedAt: "2026-09-11T08:00:00Z" })], venueLocation: "cape-town" })?.phrase, "Midnight Rose");
});

test("server and UI integrations preserve validation, permissions and bounded lookup", () => {
  const route = readFileSync("src/app/api/admin/secret-passwords/route.ts", "utf8");
  const migration = readFileSync("supabase/migrations/20260911150000_phase_41_2g_venue_secret_passwords.sql", "utf8");
  const admin = readFileSync("src/app/admin/page.tsx", "utf8");
  assert.match(route, /requireActiveStaff/);
  assert.match(route, /isSuperAdminProfile/);
  assert.match(route, /venue_scope/);
  assert.match(route, /SECRET_PASSWORD_SCHEDULE_OVERLAP/);
  assert.match(route, /\.limit\(250\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* anon, authenticated/);
  assert.match(admin, /SecretPasswordOperationalBanner/);
});

test("guest delivery uses non-blocking enrichment and does not alter QR, serial, or validation", () => {
  const ticketRoute = readFileSync("src/app/api/tickets/[reference]/route.ts", "utf8");
  const ticketClient = readFileSync("src/app/ticket/[reference]/ticket-client.tsx", "utf8");
  const pdf = readFileSync("src/lib/ticketPdf.ts", "utf8");
  const wallet = readFileSync("src/lib/appleWalletPass.ts", "utf8");
  const email = readFileSync("src/lib/email/ticketEmail.ts", "utf8");
  for (const source of [ticketRoute, wallet, email]) {
    assert.match(source, /resolveOptionalServerSecretPassword/);
  }
  assert.match(ticketClient, /secretPassword\.phrase/);
  assert.match(pdf, /input\.secretPassword/);
  assert.match(wallet, /key: "secret-password"/);
  assert.match(wallet, /serialNumber: source\.ticket\.id/);
  assert.match(wallet, /message: source\.ticket\.qr_payload/);
  assert.match(email, /shouldIncludeSecretPasswordInCommunications/);
});

test("legacy venue settings and resolver errors cannot block guest delivery", () => {
  const resolver = readFileSync("src/lib/secretPassword.ts", "utf8");
  const ticketRoute = readFileSync("src/app/api/tickets/[reference]/route.ts", "utf8");
  assert.match(
    resolver,
    /operationalSettings\?\.secretPasswordExperience\?\.\[/,
  );
  assert.match(
    resolver,
    /resolveOptionalServerSecretPassword[\s\S]*try[\s\S]*catch[\s\S]*return null/,
  );
  assert.match(ticketRoute, /normalizeVenueSettings\(row\?\.settings\)/);
});

test("secret password remains theatrical and isolated from booking business state", () => {
  const allSource = [
    readFileSync("src/lib/secretPassword.ts", "utf8"),
    readFileSync("src/app/api/admin/secret-passwords/route.ts", "utf8"),
  ].join("\n");
  assert.doesNotMatch(allSource, /\.from\("bookings"\)\.(?:insert|update|delete)/);
  assert.doesNotMatch(allSource, /\.from\("payments"\)/);
  assert.doesNotMatch(allSource, /validateTicket|check.?in|capacity|PayFast/i);
});
