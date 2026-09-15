import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getCommunicationFailureGuidance,
  getMissingEmailGuidance,
  getUnverifiedBulkDeliveryGuidance,
  resolveStaffActionGuidance,
} from "./staffActionGuidance.ts";

test("structured authoritative outcomes map to concise staff guidance", () => {
  const guidance = resolveStaffActionGuidance(
    Object.assign(new Error("This seating zone is sold out for online bookings."), {
      code: "PUBLIC_ZONE_SALES_CLOSED",
      status: 409,
    }),
    { message: "Action failed.", title: "Action failed" },
  );

  assert.equal(guidance.status, "blocked");
  assert.equal(guidance.title, "Public sales are closed");
  assert.match(guidance.message, /closed for public sales/);
  assert.match(guidance.nextStep ?? "", /Floor operations remain available/);
});

test("capacity guidance preserves the authoritative explanation", () => {
  const explanation =
    "Golden Circle represents 153 of 155 operational seats. This change would raise the representation to 157.";
  const guidance = resolveStaffActionGuidance(
    Object.assign(
      new Error("This table change would exceed the zone's effective operational capacity."),
      {
        explanation,
        status: 409,
      },
    ),
    { message: "Capacity update failed.", title: "Capacity update failed" },
  );

  assert.equal(guidance.title, "Operational capacity prevents this action");
  assert.equal(guidance.message, explanation);
});

test("public capacity, table fit, and inactive show remain distinct", () => {
  assert.equal(
    resolveStaffActionGuidance(new Error("Public sellable capacity is full."), {
      message: "Failed.",
      title: "Failed",
    }).title,
    "Public capacity prevents this action",
  );
  assert.equal(
    resolveStaffActionGuidance(new Error("No suitable existing table is available."), {
      message: "Failed.",
      title: "Failed",
    }).title,
    "No suitable table is available",
  );
  assert.equal(
    resolveStaffActionGuidance(new Error("The inactive show status prevents this action."), {
      message: "Failed.",
      title: "Failed",
    }).title,
    "Performance status prevents this action",
  );
});

test("unknown outcomes and hostile accessors fall back without throwing", () => {
  const fallback = { message: "The action could not be completed.", title: "Action failed" };
  assert.deepEqual(resolveStaffActionGuidance(null, fallback), {
    ...fallback,
    status: "error",
    technicalCode: undefined,
  });

  const hostile = Object.create(null, {
    message: {
      get() {
        throw new Error("broken guidance payload");
      },
    },
  });
  assert.deepEqual(resolveStaffActionGuidance(hostile, fallback), {
    ...fallback,
    status: "error",
  });
});

test("missing email never reports sent and deep-links with existing booking context", () => {
  const guidance = getMissingEmailGuidance("ZNG-TEST", "Ticket wasn't sent");
  assert.equal(guidance.title, "Ticket wasn't sent");
  assert.equal(guidance.status, "blocked");
  assert.deepEqual(guidance.action?.target, {
    bookingReference: "ZNG-TEST",
    destination: "customer",
  });
  assert.doesNotMatch(`${guidance.title} ${guidance.message}`, /successfully|ticket sent/i);
});

test("provider failure does not report sent while confirmed success copy remains", async () => {
  const guidance = getCommunicationFailureGuidance(
    new Error("Email could not be delivered."),
    "ZNG-TEST",
  );
  assert.equal(guidance.title, "Communication wasn't sent");
  assert.equal(guidance.status, "error");

  const page = await readFile(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /if \(status === "sent"\)[\s\S]*?Email sent successfully/);
  assert.match(page, /getCommunicationFailureGuidance/);
});

test("legacy bulk controls no longer record unverified sends as successful", async () => {
  const page = await readFile(
    new URL("../app/admin/page.tsx", import.meta.url),
    "utf8",
  );
  const functionBody = (name: string, nextName: string) =>
    page.slice(page.indexOf(`function ${name}`), page.indexOf(`function ${nextName}`));

  const reminder = functionBody("sendShowReminder", "openSelectedTemplateCommunicationConfirmation");
  const template = functionBody("sendSelectedTemplateCommunication", "broadcastOperationalUpdate");
  const broadcast = functionBody("broadcastOperationalUpdate", "findWaitlistConversionTable");

  for (const body of [reminder, template, broadcast]) {
    assert.match(body, /getUnverifiedBulkDeliveryGuidance/);
    assert.doesNotMatch(body, /saveBookings\(|sent successfully|Broadcast sent/);
  }
  assert.match(
    getUnverifiedBulkDeliveryGuidance().message,
    /no message was recorded as sent/,
  );
});

test("guidance adds no diagnostic request or Admin boot hydration", async () => {
  const [helper, component] = await Promise.all([
    readFile(new URL("./staffActionGuidance.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/StaffActionGuidanceAlert.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(`${helper}\n${component}`, /fetch\(|useEffect|setInterval|setTimeout/);
});
