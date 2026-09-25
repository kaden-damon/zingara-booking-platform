import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDineplanActionDigest,
  canReceiveDineplanVenue,
  defaultDineplanActionSettings,
  deriveDineplanActionCandidates,
  getDineplanActionTransition,
  isDineplanPreShowEscalation,
  isDineplanReminderEligible,
  isDineplanResultActionable,
  isDineplanSnapshotStale,
  routeDineplanDigestAudiences,
  type DineplanActionRecord,
} from "./dineplanActions.ts";
import type { DineplanReconciliationResult } from "./dineplanReconciliation.ts";
import { createBrandedCustomerEmail } from "./email/customerEmail.ts";

const now = new Date("2026-09-24T08:00:00.000Z");

function result(overrides: Partial<DineplanReconciliationResult> = {}): DineplanReconciliationResult {
  return {
    capacityImpact: 0,
    classification: "dineplan_newer",
    differences: ["Pax 40 / 46"],
    dineplan: {
      company: "Diopoint",
      guestName: "Gabriela Teodoro",
      mobile: "0820000000",
      notes: null,
      paymentText: "Deposit Paid",
      performanceDate: "2026-10-03",
      performanceTime: "17:00",
      pax: 40,
      raw: {},
      rowNumber: 2,
      seatingZone: "Golden Circle",
      sourceReference: "DIOPOINT",
      sourceUpdatedAt: "2026-09-24T09:00:00+02:00",
      status: "confirmed",
      tables: [],
    },
    matchConfidence: "exact",
    matchReason: "Legacy/source reference",
    reason: "Later Dineplan evidence",
    severity: "critical",
    zingara: {
      amountPaid: 1000,
      archivedAt: null,
      authoritativeChanges: [],
      bookingOrigin: "data_import",
      bookingKind: "standard",
      bookingReference: "DP-DIOPOINT",
      bookingStatus: "confirmed",
      company: "Diopoint",
      customerName: "Gabriela Teodoro",
      id: "booking-1",
      importedAt: "2026-08-29T08:00:00Z",
      mobile: "0820000000",
      outstanding: 0,
      partySize: 46,
      paymentStatus: "deposit_paid",
      performanceDate: "2026-10-03",
      performanceTime: "17:00",
      seatingZone: "Golden Circle",
      sourceReference: "DIOPOINT",
      tables: [],
      totalAmount: 46000,
      updatedAt: "2026-08-29T08:00:00Z",
    },
    ...overrides,
  };
}

function candidates(item = result()) {
  return deriveDineplanActionCandidates({
    performanceDate: "2026-10-03",
    performanceTime: "17:00",
    results: [item],
    showId: "show-1",
    snapshotId: "snapshot-1",
    sourceGeneratedAt: "2026-09-24T09:02:00+02:00",
    venue: "johannesburg",
  });
}

function action(overrides: Partial<DineplanActionRecord> = {}): DineplanActionRecord {
  const candidate = candidates()[0];
  return {
    ...candidate,
    acknowledgedAt: null,
    acknowledgedByName: null,
    firstDetectedAt: "2026-09-24T07:00:00Z",
    id: "action-1",
    lastDetectedAt: "2026-09-24T07:02:00Z",
    lastNotifiedAt: null,
    noActionAt: null,
    noActionByName: null,
    noActionReason: null,
    resolvedAt: null,
    status: "unacknowledged",
    ...overrides,
  };
}

test("MATCHED and legitimate ZINGARA NEWER results do not create actions", () => {
  assert.equal(isDineplanResultActionable(result({ classification: "matched", differences: [], severity: "normal" })), false);
  assert.equal(isDineplanResultActionable(result({ classification: "zingara_newer" })), false);
  assert.equal(candidates(result({ classification: "zingara_newer" })).length, 0);
});

test("digest recipients remain within their authoritative venue scope", () => {
  assert.equal(canReceiveDineplanVenue(["all"], "cape-town"), true);
  assert.equal(canReceiveDineplanVenue(["Cape Town"], "cape-town"), true);
  assert.equal(canReceiveDineplanVenue(["cape-town"], "johannesburg"), false);
  assert.equal(canReceiveDineplanVenue([], "johannesburg"), false);
});

test("Standard actions route to general and management recipients only", () => {
  const routed = routeDineplanDigestAudiences({
    actions: [action({ bookingKind: "standard" })],
    corporateRecipients: [{ id: "michael", venueScope: ["all"] }, { id: "lisa", venueScope: ["all"] }],
    generalRecipients: [{ id: "fatima", venueScope: ["all"] }],
    managementRecipients: [{ id: "aswin", venueScope: ["all"] }, { id: "kaden", venueScope: ["all"] }],
  });
  assert.equal(routed.length, 1);
  assert.deepEqual(routed[0].toIds, ["fatima"]);
  assert.deepEqual(routed[0].ccIds, ["aswin", "kaden"]);
  assert.equal(routed[0].audience, "general");
  assert.doesNotMatch(JSON.stringify(routed[0].toIds), /kaden/);
});

test("Corporate actions route to general, management and Corporate-only recipients", () => {
  const routed = routeDineplanDigestAudiences({
    actions: [action({ bookingKind: "corporate" })],
    corporateRecipients: [{ id: "michael", venueScope: ["all"] }, { id: "lisa", venueScope: ["all"] }],
    generalRecipients: [{ id: "fatima", venueScope: ["all"] }],
    managementRecipients: [{ id: "aswin", venueScope: ["all"] }, { id: "kaden", venueScope: ["all"] }],
  });
  assert.equal(routed.length, 2);
  assert.deepEqual(routed.find((item) => item.audience === "general")?.toIds, ["fatima"]);
  assert.deepEqual(routed.find((item) => item.audience === "general")?.ccIds, ["aswin", "kaden"]);
  assert.deepEqual(routed.find((item) => item.audience === "corporate")?.toIds, ["michael", "lisa"]);
});

test("mixed routing never exposes Standard-only details to Corporate-only recipients", () => {
  const standard = action({ bookingKind: "standard", id: "standard-action" });
  const corporate = action({ bookingKind: "corporate", id: "corporate-action" });
  const routed = routeDineplanDigestAudiences({
    actions: [standard, corporate],
    corporateRecipients: [{ id: "michael", venueScope: ["all"] }, { id: "lisa", venueScope: ["all"] }],
    generalRecipients: [{ id: "fatima", venueScope: ["all"] }],
    managementRecipients: [{ id: "aswin", venueScope: ["all"] }],
  });
  assert.deepEqual(routed.find((item) => item.audience === "general")?.actions.map((item) => item.id), ["standard-action", "corporate-action"]);
  assert.deepEqual(routed.find((item) => item.audience === "corporate")?.actions.map((item) => item.id), ["corporate-action"]);
});

test("venue-limited, disabled and removed recipients are excluded without extra queries", () => {
  const routed = routeDineplanDigestAudiences({
    actions: [action({ venue: "johannesburg" })],
    corporateRecipients: [],
    generalRecipients: [
      { id: "enabled-jhb", venueScope: ["johannesburg"] },
      { id: "wrong-venue", venueScope: ["cape-town"] },
    ],
    managementRecipients: [],
  });
  assert.deepEqual(routed[0].toIds, ["enabled-jhb"]);
  assert.doesNotMatch(JSON.stringify(routed), /wrong-venue|disabled|removed/);
});

test("DINEPLAN NEWER cancellation creates a critical cancellation action", () => {
  const item = result({
    capacityImpact: 35,
    differences: ["Status cancelled / confirmed"],
    dineplan: { ...result().dineplan!, pax: 35, status: "cancelled" },
  });
  const candidate = candidates(item)[0];
  assert.equal(candidate.actionKind, "verify_cancel");
  assert.equal(candidate.capacityImpact, 35);
  assert.match(candidate.manualAction, /normal Zingara booking workflow/i);
});

test("critical pax mismatch creates a stable idempotent action", () => {
  const first = candidates()[0];
  const repeated = candidates()[0];
  assert.equal(first.actionKind, "verify_pax");
  assert.equal(first.actionKey, repeated.actionKey);
  assert.equal(first.materialFingerprint, repeated.materialFingerprint);
});

test("later table-only difference does not create unnecessary action", () => {
  assert.equal(isDineplanResultActionable(result({ classification: "review", differences: ["Table 20 / 21"], severity: "normal" })), false);
});

test("payment discrepancy creates verification guidance, never a payment mutation instruction", () => {
  const candidate = candidates(result({ classification: "review", differences: ["Payment wording Paid in full / deposit_paid"], severity: "normal" }))[0];
  assert.equal(candidate.actionKind, "verify_payment");
  assert.match(candidate.manualAction, /Do not mark paid from Dineplan wording alone/i);
});

test("confirmed source-only action gives specific verify-then-create guidance", () => {
  const sourceOnly = result({
    classification: "review",
    differences: ["Booking missing from Zingara"],
    dineplan: { ...result().dineplan!, guestName: "Lloyd Swartz", pax: 4, seatingZone: "Middle Ring R1320pp", sourceReference: null },
    matchConfidence: "unmatched",
    severity: "critical",
    zingara: null,
  });
  const candidate = candidates(sourceOnly)[0];
  assert.match(candidate.manualAction, /Dineplan shows Lloyd Swartz, 4 pax, Middle Ring R1320pp/);
  assert.match(candidate.manualAction, /No authoritative Zingara booking was found for this performance/);
  assert.match(candidate.manualAction, /Verify the source reservation, then create the booking in Zingara if it is still valid/);
  assert.equal(candidate.bookingReference, null);
});

test("acknowledgement remains unresolved and unchanged snapshots preserve it", () => {
  const transition = getDineplanActionTransition({ materiallyChanged: false, presentInLatestReconciliation: true, status: "acknowledged" });
  assert.equal(transition.status, "acknowledged");
  assert.equal(transition.event, null);
});

test("newer reconciliation without the discrepancy auto-resolves outstanding action", () => {
  const transition = getDineplanActionTransition({ materiallyChanged: false, presentInLatestReconciliation: false, status: "acknowledged" });
  assert.equal(transition.status, "resolved");
  assert.equal(transition.event, "resolved_by_reconciliation");
});

test("No Action Required does not reopen for an identical snapshot", () => {
  const transition = getDineplanActionTransition({ materiallyChanged: false, presentInLatestReconciliation: true, status: "no_action" });
  assert.equal(transition.status, "no_action");
  assert.equal(transition.event, null);
});

test("material state change reopens acknowledged, resolved or no-action state", () => {
  for (const status of ["acknowledged", "resolved", "no_action"] as const) {
    const transition = getDineplanActionTransition({ materiallyChanged: true, presentInLatestReconciliation: true, status });
    assert.equal(transition.status, "unacknowledged");
    assert.equal(transition.event, "materially_changed");
  }
});

test("resolved discrepancy that reappears is reopened", () => {
  const transition = getDineplanActionTransition({ materiallyChanged: false, presentInLatestReconciliation: true, status: "resolved" });
  assert.equal(transition.status, "unacknowledged");
  assert.equal(transition.event, "reopened");
});

test("normal digest subject contains unresolved count and single show", () => {
  const digest = buildDineplanActionDigest({
    actions: [action({ severity: "normal" })],
    adminBaseUrl: "https://book.zingara.co.za",
    now,
    settings: defaultDineplanActionSettings,
  });
  assert.match(digest!.subject, /1 booking discrepancies \| JHB 03 Oct 2026/);
});

test("critical digest subject contains critical count and affected pax", () => {
  const digest = buildDineplanActionDigest({ actions: [action({ capacityImpact: 35 })], adminBaseUrl: "https://book.zingara.co.za", now, settings: defaultDineplanActionSettings });
  assert.match(digest!.subject, /1 critical booking discrepancies \| 35 pax affected/);
});

test("digest groups multiple actions and contains authenticated navigation only", () => {
  const digest = buildDineplanActionDigest({
    actions: [action(), action({ actionKey: "second", bookingReference: "DP-SECOND", id: "action-2" })],
    adminBaseUrl: "https://book.zingara.co.za",
    now,
    settings: defaultDineplanActionSettings,
  });
  assert.equal(digest!.unresolvedCount, 2);
  assert.match(digest!.message, /OPEN BOOKING: https:\/\/book\.zingara\.co\.za\/admin\?section=bookings/);
  assert.match(digest!.message, /ACKNOWLEDGE: https:\/\/book\.zingara\.co\.za\/admin\?section=platform-operations/);
});

test("Action Digest renders inside the existing branded Zingara mailer", async () => {
  const digest = buildDineplanActionDigest({
    actions: [action()],
    adminBaseUrl: "https://book.zingara.co.za",
    now,
    settings: defaultDineplanActionSettings,
  });
  const branded = await createBrandedCustomerEmail({
    ctaLabel: "REVIEW IN ZINGARA",
    ctaUrl: "https://book.zingara.co.za/admin?section=platform-operations&tab=dineplan-actions",
    heading: "Dineplan Action Digest",
    html: digest!.html,
    includeAgePolicy: false,
    message: digest!.message,
    subject: digest!.subject,
  });

  assert.match(branded.html, /data-zingara-customer-email="true"/);
  assert.match(branded.html, /THE ROYAL COUNTESS/);
  assert.match(branded.html, /Dineplan Action Digest/);
  assert.match(branded.html, /REVIEW IN ZINGARA/);
  assert.doesNotMatch(branded.html, /Age Restriction/);
});

test("zero actionable or only resolved items produces no email digest", () => {
  assert.equal(buildDineplanActionDigest({ actions: [], adminBaseUrl: "https://book.zingara.co.za", now, settings: defaultDineplanActionSettings }), null);
  assert.equal(buildDineplanActionDigest({ actions: [action({ status: "resolved" })], adminBaseUrl: "https://book.zingara.co.za", now, settings: defaultDineplanActionSettings }), null);
});

test("critical unacknowledged and acknowledged actions remain hourly eligible", () => {
  assert.equal(isDineplanReminderEligible(action({ lastNotifiedAt: "2026-09-24T06:59:00Z" }), defaultDineplanActionSettings, now), true);
  assert.equal(isDineplanReminderEligible(action({ acknowledgedAt: "2026-09-24T06:00:00Z", lastNotifiedAt: "2026-09-24T06:59:00Z", status: "acknowledged" }), defaultDineplanActionSettings, now), true);
});

test("normal acknowledged action uses reduced configured cadence", () => {
  const normal = action({ lastNotifiedAt: "2026-09-24T06:59:00Z", severity: "normal", status: "acknowledged" });
  assert.equal(isDineplanReminderEligible(normal, defaultDineplanActionSettings, now), false);
  assert.equal(isDineplanReminderEligible({ ...normal, lastNotifiedAt: "2026-09-24T04:59:00Z" }, defaultDineplanActionSettings, now), true);
});

test("stale threshold and stale critical upload warning are explicit", () => {
  assert.equal(isDineplanSnapshotStale("2026-09-23T07:59:00Z", defaultDineplanActionSettings, now), true);
  assert.equal(isDineplanSnapshotStale("2026-09-24T07:30:00Z", defaultDineplanActionSettings, now), false);
  const digest = buildDineplanActionDigest({ actions: [action({ sourceGeneratedAt: "2026-09-23T07:00:00Z" })], adminBaseUrl: "https://book.zingara.co.za", now, settings: defaultDineplanActionSettings });
  assert.match(digest!.message, /Upload a fresh Dineplan export/i);
});

test("critical action inside pre-show threshold triggers escalation", () => {
  const imminent = action({ performanceDate: "2026-09-24", performanceTime: "12:00" });
  assert.equal(isDineplanPreShowEscalation(imminent, defaultDineplanActionSettings, now), true);
  const digest = buildDineplanActionDigest({ actions: [imminent], adminBaseUrl: "https://book.zingara.co.za", now, settings: defaultDineplanActionSettings });
  assert.match(digest!.subject, /remain for today's JHB show/);
});

test("past-show operational actions stop reminders while financial review may continue", () => {
  const past = action({ performanceDate: "2026-09-23" });
  assert.equal(isDineplanReminderEligible(past, defaultDineplanActionSettings, now), false);
  assert.equal(isDineplanReminderEligible({ ...past, actionKind: "verify_payment" }, defaultDineplanActionSettings, now), true);
});

test("acknowledged owner remains visible in digest", () => {
  const digest = buildDineplanActionDigest({ actions: [action({ acknowledgedByName: "Box Office User", status: "acknowledged" })], adminBaseUrl: "https://book.zingara.co.za", now, settings: defaultDineplanActionSettings });
  assert.match(digest!.message, /BEING HANDLED BY Box Office User/);
});
