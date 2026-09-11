import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveScheduledSecretPassword,
  type SecretPasswordSchedule,
} from "./secretPasswordResolution.ts";
import { getSecretPasswordLifecycleStatus } from "./secretPasswordLifecycle.ts";
import { mergeSecretPasswordVenueConfiguration } from "./secretPasswordVenueConfiguration.ts";

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

test("schedule lifecycle distinguishes scheduled, active, disabled and expired in SAST", () => {
  const now = new Date("2026-09-11T10:00:00Z"); // 12:00 SAST
  assert.equal(getSecretPasswordLifecycleStatus(schedule({ startDate: "2026-09-12", endDate: "2026-09-12" }), now), "scheduled");
  assert.equal(getSecretPasswordLifecycleStatus(schedule(), now), "active");
  assert.equal(getSecretPasswordLifecycleStatus(schedule({ enabled: false }), now), "disabled");
  assert.equal(getSecretPasswordLifecycleStatus(schedule({ endTime: "11:59", startTime: "08:00" }), now), "expired");
  assert.equal(getSecretPasswordLifecycleStatus(schedule({ endDate: "2026-09-10", startDate: "2026-09-10" }), now), "expired");
});

test("schedule lifecycle UI uses explicit same-record enable and disable actions", () => {
  const admin = readFileSync("src/app/admin/SecretPasswordSettings.tsx", "utf8");
  const client = readFileSync("src/lib/supabase/secretPasswords.ts", "utf8");
  assert.match(admin, /getSecretPasswordLifecycleStatus/);
  assert.match(admin, /setSecretPasswordScheduleEnabled\(schedule\.id, false\)/);
  assert.match(admin, /setSecretPasswordScheduleEnabled\(schedule\.id, true\)/);
  assert.match(admin, /lifecycle === "disabled"[\s\S]*>Enable</);
  assert.match(admin, /lifecycle !== "expired"/);
  assert.doesNotMatch(admin, /Delete future/);
  assert.match(client, /lifecycleAction: enabled \? "enable" : "disable"/);
  assert.doesNotMatch(client, /method: "DELETE"/);
});

test("schedule API reactivates in place, preserves disabled state on edit and audits transitions", () => {
  const route = readFileSync("src/app/api/admin/secret-passwords/route.ts", "utf8");
  assert.match(route, /body\.lifecycleAction/);
  assert.match(route, /\.update\(\{ enabled \}\)[\s\S]*\.eq\("id", body\.id\)/);
  assert.match(route, /payload\.enabled = existing\.enabled/);
  assert.match(route, /Expired Secret Password schedules are historical and cannot be reactivated/);
  assert.match(route, /Secret Password schedule enabled/);
  assert.match(route, /Secret Password schedule disabled/);
  assert.match(route, /lifecycleState: previousState/);
  assert.match(route, /lifecycleState: newState/);
  assert.match(route, /SECRET_PASSWORD_SCHEDULE_OVERLAP/);
  assert.doesNotMatch(route, /\.delete\(\)\.eq\("id"/);
});

test("venue enablement and schedule enablement remain independent", () => {
  const admin = readFileSync("src/app/admin/SecretPasswordSettings.tsx", "utf8");
  const route = readFileSync("src/app/api/admin/secret-passwords/route.ts", "utf8");
  assert.match(admin, /updateConfiguration\(location\.value, \{ enabled: event\.target\.checked \}\)/);
  assert.match(route, /\.from\("venue_secret_password_schedules"\)[\s\S]*\.update\(\{ enabled \}\)/);
  assert.doesNotMatch(route, /\.from\("venue_settings"\)\.update/);
});

test("venue Secret Password settings use explicit independent Save Changes actions", () => {
  const component = readFileSync("src/app/admin/SecretPasswordSettings.tsx", "utf8");
  assert.match(component, /showLocationOptions\.map/);
  assert.match(component, /onSaveConfiguration\(location, configurationDraft\[location\]\)/);
  assert.match(component, /Save Changes/);
  assert.match(component, /disabled=\{!isDirty \|\| saveState\.status === "saving"\}/);
  assert.match(component, /Settings saved\./);
  assert.match(component, /Settings were not saved\./);
  assert.match(component, /persistedConfigurationRef/);
});

test("venue settings API merges one Secret Password venue into current authoritative settings", () => {
  const route = readFileSync("src/app/api/admin/venue-settings/route.ts", "utf8");
  const client = readFileSync("src/lib/supabase/venueSettings.ts", "utf8");
  const admin = readFileSync("src/app/admin/page.tsx", "utf8");
  assert.match(route, /body\.secretPasswordExperience/);
  assert.match(route, /const currentSettings = await loadVenueSettings\(\)/);
  assert.match(route, /mergeSecretPasswordVenueConfiguration\([\s\S]*currentSettings,[\s\S]*venueLocation,[\s\S]*configuration/);
  assert.match(client, /body: \{ secretPasswordExperience: \{ configuration, venueLocation \} \}/);
  assert.match(admin, /saveSecretPasswordVenueConfiguration\([\s\S]*location,[\s\S]*\{ \.\.\.configuration, heading, instruction \}/);
  assert.match(admin, /configuration=\{venueConfig\.operationalSettings\.secretPasswordExperience\}/);
  assert.doesNotMatch(route, /venue_secret_password_schedules/);
});

test("venue Secret Password values survive storage normalization without changing the other venue", () => {
  const original = {
    operationalSettings: {
      secretPasswordExperience: {
        "cape-town": {
          enabled: false,
          heading: "Tonight's Secret Password",
          includeInCommunications: false,
          instruction: "Whisper this to the doorman when you arrive.",
        },
        johannesburg: {
          enabled: false,
          heading: "Tonight's Secret Password",
          includeInCommunications: false,
          instruction: "Whisper this to the doorman when you arrive.",
        },
      },
    },
  } as Parameters<typeof mergeSecretPasswordVenueConfiguration>[0];
  const capeTownBefore = structuredClone(
    original.operationalSettings.secretPasswordExperience["cape-town"],
  );
  const johannesburg = {
    enabled: true,
    heading: "Tonight's Secret Password",
    includeInCommunications: true,
    instruction: "Whisper this to the doorman when you arrive.",
  };
  const saved = mergeSecretPasswordVenueConfiguration(
    original,
    "johannesburg",
    johannesburg,
  );
  const refreshed = JSON.parse(JSON.stringify(saved)) as typeof saved;
  assert.deepEqual(
    refreshed.operationalSettings.secretPasswordExperience.johannesburg,
    johannesburg,
  );
  assert.deepEqual(
    refreshed.operationalSettings.secretPasswordExperience["cape-town"],
    capeTownBefore,
  );

  const capeTown = {
    ...capeTownBefore,
    enabled: true,
    heading: "Cape Town Password",
    includeInCommunications: true,
    instruction: "Cape Town instruction.",
  };
  const capeTownSaved = mergeSecretPasswordVenueConfiguration(
    refreshed,
    "cape-town",
    capeTown,
  );
  assert.deepEqual(
    capeTownSaved.operationalSettings.secretPasswordExperience["cape-town"],
    capeTown,
  );
  assert.deepEqual(
    capeTownSaved.operationalSettings.secretPasswordExperience.johannesburg,
    johannesburg,
  );
});

test("all four venue values persist together without an automatic communication", () => {
  const component = readFileSync("src/app/admin/SecretPasswordSettings.tsx", "utf8");
  const route = readFileSync("src/app/api/admin/venue-settings/route.ts", "utf8");
  for (const field of ["enabled", "heading", "instruction", "includeInCommunications"]) {
    assert.match(component, new RegExp(`config\\.${field}`));
  }
  assert.match(route, /Secret Password venue configuration updated/);
  assert.match(route, /notifySecretPasswordWalletUpdates/);
  assert.doesNotMatch(route, /sendEmail|sendCommunication|createCommunication/);
});

test("communication preference does not control live-ticket password resolution", () => {
  const withCommunicationOff = {
    ...configuration,
    includeInCommunications: false,
  };
  assert.equal(resolveScheduledSecretPassword({ configuration: withCommunicationOff, show, schedules: [schedule()], venueLocation: "cape-town" })?.phrase, "Velvet Moon");
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
