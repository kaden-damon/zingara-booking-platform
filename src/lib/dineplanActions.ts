import { createHash } from "node:crypto";
import type {
  DineplanClassification,
  DineplanReconciliationResult,
  DineplanSeverity,
} from "./dineplanReconciliation.ts";
import { normalizeStaffVenueScope } from "./staffLocations.ts";
import { createZingaraEmailCta } from "./email/customerEmail.ts";

export type DineplanActionKind =
  | "review_booking"
  | "review_zone"
  | "verify_cancel"
  | "verify_pax"
  | "verify_payment"
  | "verify_performance";

export type DineplanActionStatus =
  | "acknowledged"
  | "no_action"
  | "resolved"
  | "unacknowledged";

export type DineplanActionSettings = {
  actionRecipientStaffIds: string[];
  corporateRecipientStaffIds: string[];
  hourlyRemindersEnabled: boolean;
  managementCcStaffIds: string[];
  normalAcknowledgedCadenceHours: number;
  preShowEscalationHours: number;
  snapshotStaleHours: number;
};

export const defaultDineplanActionSettings: DineplanActionSettings = {
  actionRecipientStaffIds: [],
  corporateRecipientStaffIds: [],
  hourlyRemindersEnabled: false,
  managementCcStaffIds: [],
  normalAcknowledgedCadenceHours: 3,
  preShowEscalationHours: 3,
  snapshotStaleHours: 24,
};

export function canReceiveDineplanVenue(
  venueScope: string[],
  venue: DineplanActionCandidate["venue"],
) {
  const scope = normalizeStaffVenueScope(venueScope);
  return scope.includes("all") || scope.includes(venue);
}

export type DineplanActionCandidate = {
  actionKey: string;
  actionKind: DineplanActionKind;
  bookingId: string | null;
  bookingKind: "corporate" | "standard" | "unknown";
  bookingReference: string | null;
  capacityImpact: number;
  classification: DineplanClassification;
  dineplanState: string;
  guestLabel: string;
  manualAction: string;
  materialFingerprint: string;
  pax: number;
  performanceDate: string;
  performanceTime: string | null;
  severity: DineplanSeverity;
  showId: string;
  snapshotId: string;
  sourceGeneratedAt: string | null;
  sourceResultKey: string;
  venue: "cape-town" | "johannesburg";
  zingaraState: string;
  zone: string | null;
};

export type DineplanActionRecord = DineplanActionCandidate & {
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  firstDetectedAt: string;
  id: string;
  lastDetectedAt: string;
  lastNotifiedAt: string | null;
  noActionAt: string | null;
  noActionByName: string | null;
  noActionReason: string | null;
  resolvedAt: string | null;
  status: DineplanActionStatus;
};

export type DineplanDigest = {
  capacityPax: number;
  criticalCount: number;
  html: string;
  message: string;
  preShowEscalation: boolean;
  stale: boolean;
  subject: string;
  unresolvedCount: number;
};

export type DineplanDigestRecipient = {
  id: string;
  venueScope: string[];
};

export type DineplanDigestAudience = {
  actions: DineplanActionRecord[];
  audience: "corporate" | "general";
  ccIds: string[];
  toIds: string[];
};

export function routeDineplanDigestAudiences(input: {
  actions: DineplanActionRecord[];
  corporateRecipients: DineplanDigestRecipient[];
  generalRecipients: DineplanDigestRecipient[];
  managementRecipients: DineplanDigestRecipient[];
}) {
  const audiences = new Map<string, DineplanDigestAudience>();
  const add = (
    action: DineplanActionRecord,
    audience: DineplanDigestAudience["audience"],
    toRecipients: DineplanDigestRecipient[],
    ccRecipients: DineplanDigestRecipient[],
  ) => {
    const toIds = toRecipients
      .filter((recipient) => canReceiveDineplanVenue(recipient.venueScope, action.venue))
      .map((recipient) => recipient.id);
    if (!toIds.length) return;
    const ccIds = ccRecipients
      .filter((recipient) => canReceiveDineplanVenue(recipient.venueScope, action.venue))
      .map((recipient) => recipient.id)
      .filter((id) => !toIds.includes(id));
    const key = JSON.stringify([audience, toIds.slice().sort(), ccIds.slice().sort()]);
    const existing = audiences.get(key) ?? { actions: [], audience, ccIds, toIds };
    existing.actions.push(action);
    audiences.set(key, existing);
  };
  for (const action of input.actions) {
    add(action, "general", input.generalRecipients, input.managementRecipients);
    if (action.bookingKind === "corporate") {
      add(action, "corporate", input.corporateRecipients, []);
    }
  }
  return [...audiences.values()];
}

export function getDineplanActionTransition(input: {
  materiallyChanged: boolean;
  presentInLatestReconciliation: boolean;
  status: DineplanActionStatus;
}) {
  if (!input.presentInLatestReconciliation) {
    return ["acknowledged", "unacknowledged"].includes(input.status)
      ? { event: "resolved_by_reconciliation" as const, status: "resolved" as const }
      : { event: null, status: input.status };
  }
  if (input.materiallyChanged) {
    return { event: "materially_changed" as const, status: "unacknowledged" as const };
  }
  if (input.status === "resolved") {
    return { event: "reopened" as const, status: "unacknowledged" as const };
  }
  return { event: null, status: input.status };
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function resultFields(result: DineplanReconciliationResult) {
  const fields = new Set<string>();
  for (const difference of result.differences) {
    const field = difference.split(/\s/, 1)[0]?.toLowerCase();
    if (field) fields.add(field);
  }
  return fields;
}

function actionKindFor(result: DineplanReconciliationResult): DineplanActionKind {
  const fields = resultFields(result);
  if (result.dineplan?.status === "cancelled" && result.zingara) return "verify_cancel";
  if (fields.has("pax")) return "verify_pax";
  if (fields.has("performance")) return "verify_performance";
  if (fields.has("zone")) return "review_zone";
  if (fields.has("payment")) return "verify_payment";
  return "review_booking";
}

function manualActionFor(kind: DineplanActionKind, result: DineplanReconciliationResult) {
  if (kind === "verify_cancel") return "Verify the cancellation, then cancel through the normal Zingara booking workflow if confirmed.";
  if (kind === "verify_pax") {
    const sourcePax = result.dineplan?.pax;
    const zingaraPax = result.zingara?.partySize;
    return sourcePax && zingaraPax
      ? `Confirm the latest Dineplan amendment, then update the Zingara booking from ${zingaraPax} to ${sourcePax} guests if verified.`
      : "Verify the authoritative guest count, then use the normal guest-count workflow if a correction is approved.";
  }
  if (kind === "verify_performance") return "Verify the performance date, then use the normal show-move workflow if a correction is approved.";
  if (kind === "review_zone") return "Review the seating entitlement and use the normal zone workflow only if a correction is approved.";
  if (kind === "verify_payment") return "Verify the payment evidence in Zingara. Do not mark paid from Dineplan wording alone.";
  return result.zingara
    ? "Review the booking evidence and use the existing Zingara workflow for any approved correction."
    : "Verify that this reservation should exist in Zingara before using the normal booking creation workflow.";
}

function compactDineplanState(result: DineplanReconciliationResult) {
  const source = result.dineplan;
  if (!source) return "Not present in this snapshot";
  return [
    source.status === "cancelled" ? "Cancelled" : `${source.pax} pax`,
    source.seatingZone,
    source.paymentText,
  ].filter(Boolean).join(" · ");
}

function compactZingaraState(result: DineplanReconciliationResult) {
  const booking = result.zingara;
  if (!booking) return "No authoritative match";
  return [
    booking.bookingStatus,
    `${booking.partySize} pax`,
    booking.seatingZone,
    booking.paymentStatus,
  ].filter(Boolean).join(" · ");
}

export function isDineplanResultActionable(result: DineplanReconciliationResult) {
  if (result.classification === "matched" || result.classification === "zingara_newer") return false;
  if (!result.dineplan) return false;
  const fields = resultFields(result);
  if (fields.size === 1 && fields.has("table")) return false;
  if (result.classification === "dineplan_newer") return true;
  if (result.severity === "critical") return true;
  if (fields.has("payment")) return true;
  return !result.zingara && Boolean(result.dineplan.sourceReference);
}

export function deriveDineplanActionCandidates(input: {
  performanceDate: string;
  performanceTime: string | null;
  results: DineplanReconciliationResult[];
  showId: string;
  snapshotId: string;
  sourceGeneratedAt: string | null;
  venue: "cape-town" | "johannesburg";
}) {
  return input.results.flatMap<DineplanActionCandidate>((result) => {
    if (!isDineplanResultActionable(result)) return [];
    const actionKind = actionKindFor(result);
    const identity = result.zingara?.id ?? result.dineplan?.sourceReference ?? [
      result.dineplan?.mobile,
      result.dineplan?.performanceDate,
      result.dineplan?.rowNumber,
    ].join(":");
    const actionKey = hash([input.showId, identity, actionKind]);
    const sourceResultKey = `${result.dineplan?.rowNumber ?? "missing"}:${result.zingara?.id ?? "unmatched"}`;
    const materialFingerprint = hash({
      actionKind,
      capacityImpact: result.capacityImpact,
      classification: result.classification,
      differences: result.differences,
      dineplan: result.dineplan ? {
        date: result.dineplan.performanceDate,
        pax: result.dineplan.pax,
        payment: result.dineplan.paymentText,
        status: result.dineplan.status,
        zone: result.dineplan.seatingZone,
      } : null,
      severity: result.severity,
      zingara: result.zingara ? {
        date: result.zingara.performanceDate,
        pax: result.zingara.partySize,
        payment: result.zingara.paymentStatus,
        status: result.zingara.bookingStatus,
        zone: result.zingara.seatingZone,
      } : null,
    });
    return [{
      actionKey,
      actionKind,
      bookingId: result.zingara?.id ?? null,
      bookingKind: result.zingara?.bookingKind ?? "unknown",
      bookingReference: result.zingara?.bookingReference ?? null,
      capacityImpact: result.capacityImpact,
      classification: result.classification,
      dineplanState: compactDineplanState(result),
      guestLabel: result.dineplan?.company || result.dineplan?.guestName || result.zingara?.company || result.zingara?.customerName || "Unmatched reservation",
      manualAction: manualActionFor(actionKind, result),
      materialFingerprint,
      pax: result.zingara?.partySize ?? result.dineplan?.pax ?? 0,
      performanceDate: input.performanceDate,
      performanceTime: input.performanceTime,
      severity: result.severity,
      showId: input.showId,
      snapshotId: input.snapshotId,
      sourceGeneratedAt: input.sourceGeneratedAt,
      sourceResultKey,
      venue: input.venue,
      zingaraState: compactZingaraState(result),
      zone: result.zingara?.seatingZone ?? result.dineplan?.seatingZone ?? null,
    }];
  });
}

export function isOutstandingAction(action: Pick<DineplanActionRecord, "status">) {
  return action.status === "unacknowledged" || action.status === "acknowledged";
}

function showAt(action: Pick<DineplanActionRecord, "performanceDate" | "performanceTime">) {
  return Date.parse(`${action.performanceDate}T${action.performanceTime ?? "23:59"}:00+02:00`);
}

export function isDineplanReminderEligible(
  action: DineplanActionRecord,
  settings: DineplanActionSettings,
  now = new Date(),
) {
  if (!isOutstandingAction(action)) return false;
  if (showAt(action) < now.getTime() && action.actionKind !== "verify_payment") return false;
  const cadenceHours = action.severity === "critical" || action.status === "unacknowledged"
    ? 1
    : settings.normalAcknowledgedCadenceHours;
  if (!action.lastNotifiedAt) return true;
  return now.getTime() - Date.parse(action.lastNotifiedAt) >= cadenceHours * 60 * 60 * 1000;
}

export function isDineplanPreShowEscalation(
  action: DineplanActionRecord,
  settings: DineplanActionSettings,
  now = new Date(),
) {
  if (!isOutstandingAction(action) || action.severity !== "critical") return false;
  const untilShow = showAt(action) - now.getTime();
  return untilShow >= 0 && untilShow <= settings.preShowEscalationHours * 60 * 60 * 1000;
}

export function isDineplanSnapshotStale(
  sourceGeneratedAt: string | null,
  settings: DineplanActionSettings,
  now = new Date(),
) {
  if (!sourceGeneratedAt || !Number.isFinite(Date.parse(sourceGeneratedAt))) return true;
  return now.getTime() - Date.parse(sourceGeneratedAt) > settings.snapshotStaleHours * 60 * 60 * 1000;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Johannesburg",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+02:00`));
}

function formatTimestamp(value: string | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function dataAge(value: string | null, now: Date) {
  if (!value) return "unknown";
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(value)) / 60_000));
  if (minutes < 120) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function venueLabel(venue: DineplanActionRecord["venue"]) {
  return venue === "cape-town" ? "CPT" : "JHB";
}

export function buildDineplanActionDigest(input: {
  actions: DineplanActionRecord[];
  adminBaseUrl: string;
  now?: Date;
  settings: DineplanActionSettings;
}) : DineplanDigest | null {
  const now = input.now ?? new Date();
  const actions = input.actions.filter(isOutstandingAction);
  if (!actions.length) return null;
  const criticalCount = actions.filter((action) => action.severity === "critical").length;
  const capacityPax = actions.filter((action) => action.severity === "critical").reduce((total, action) => total + action.capacityImpact, 0);
  const acknowledged = actions.filter((action) => action.status === "acknowledged").length;
  const snapshots = actions.map((action) => action.sourceGeneratedAt).filter((value): value is string => Boolean(value)).sort();
  const latestSnapshot = snapshots.at(-1) ?? null;
  const stale = isDineplanSnapshotStale(latestSnapshot, input.settings, now);
  const preShowEscalation = actions.some((action) => isDineplanPreShowEscalation(action, input.settings, now));
  const showKeys = new Set(actions.map((action) => `${action.venue}:${action.performanceDate}:${action.performanceTime}`));
  let subject: string;
  if (preShowEscalation) {
    const first = actions[0];
    subject = `URGENT — ${actions.length} booking discrepancies remain for today's ${venueLabel(first.venue)} show${capacityPax > 0 ? ` | ${capacityPax} pax affected` : ""}`;
  } else if (criticalCount > 0) {
    subject = `URGENT — Zingara: ${criticalCount} critical booking discrepancies${capacityPax > 0 ? ` | ${capacityPax} pax affected` : ""}`;
  } else if (showKeys.size === 1) {
    const first = actions[0];
    subject = `Zingara Action Required: ${actions.length} booking discrepancies | ${venueLabel(first.venue)} ${formatDate(first.performanceDate)}`;
  } else {
    subject = `Zingara Action Required: ${actions.length} booking discrepancies | ${showKeys.size} shows`;
  }
  const header = [
    `${actions.length} BOOKINGS NEED ATTENTION`,
    `${criticalCount} Critical · ${actions.length - acknowledged} Unacknowledged · ${acknowledged} Being Handled`,
    `Last Dineplan snapshot: ${formatTimestamp(latestSnapshot)}`,
    `Data age: ${dataAge(latestSnapshot, now)}`,
  ];
  if (stale && criticalCount > 0) header.push("DINEPLAN SNAPSHOT MAY BE OUT OF DATE. Upload a fresh Dineplan export before making a source-dependent correction.");
  const itemLines = actions.flatMap((action, index) => {
    const openBooking = action.bookingReference
      ? `${input.adminBaseUrl}/admin?section=bookings&booking=${encodeURIComponent(action.bookingReference)}`
      : `${input.adminBaseUrl}/admin?section=platform-operations&system=dineplan&action=${action.id}`;
    const acknowledge = `${input.adminBaseUrl}/admin?section=platform-operations&system=dineplan&action=${action.id}`;
    return [
      "",
      `${index + 1}. ${action.guestLabel} — ${action.pax} pax`,
      `${venueLabel(action.venue)} · ${formatDate(action.performanceDate)} · ${action.zone ?? "Zone not stated"}`,
      `Dineplan: ${action.dineplanState}`,
      `Zingara: ${action.zingaraState}`,
      action.capacityImpact > 0 ? `CAPACITY IMPACT: ${action.capacityImpact} pax currently consuming Zingara capacity` : null,
      action.status === "acknowledged" ? `BEING HANDLED BY ${action.acknowledgedByName ?? "staff"}` : "BOX OFFICE ACTION REQUIRED",
      `ACTION: ${action.manualAction}`,
      `OPEN BOOKING: ${openBooking}`,
      `ACKNOWLEDGE: ${acknowledge}`,
    ].filter((line): line is string => Boolean(line));
  });
  const message = [...header, ...itemLines].join("\n");
  const htmlItems = actions.map((action) => {
    const openBooking = action.bookingReference
      ? `${input.adminBaseUrl}/admin?section=bookings&booking=${encodeURIComponent(action.bookingReference)}`
      : `${input.adminBaseUrl}/admin?section=platform-operations&system=dineplan&action=${action.id}`;
    const acknowledge = `${input.adminBaseUrl}/admin?section=platform-operations&system=dineplan&action=${action.id}`;
    return `<li style="margin:0 0 20px"><strong>${escapeHtml(action.guestLabel)} — ${action.pax} pax${action.bookingKind === "corporate" ? " · Corporate" : ""}</strong><br>${venueLabel(action.venue)} · ${escapeHtml(formatDate(action.performanceDate))} · ${escapeHtml(action.zone ?? "Zone not stated")}<br>Dineplan: ${escapeHtml(action.dineplanState)}<br>Zingara: ${escapeHtml(action.zingaraState)}${action.capacityImpact > 0 ? `<br><strong>CAPACITY IMPACT: ${action.capacityImpact} pax</strong>` : ""}<br><strong>${action.status === "acknowledged" ? `BEING HANDLED BY ${escapeHtml(action.acknowledgedByName ?? "staff")}` : "BOX OFFICE ACTION REQUIRED"}</strong><br>ACTION: ${escapeHtml(action.manualAction)}<div style="margin-top:12px">${createZingaraEmailCta(action.bookingReference ? "OPEN BOOKING" : "REVIEW IN ZINGARA", openBooking)}</div><div style="margin-top:8px">${createZingaraEmailCta("ACKNOWLEDGE", acknowledge)}</div></li>`;
  }).join("");
  const html = `<h2>${actions.length} BOOKINGS NEED ATTENTION</h2><p>${criticalCount} Critical · ${actions.length - acknowledged} Unacknowledged · ${acknowledged} Being Handled<br>Last Dineplan snapshot: ${escapeHtml(formatTimestamp(latestSnapshot))}<br>Data age: ${escapeHtml(dataAge(latestSnapshot, now))}</p>${stale && criticalCount > 0 ? "<p><strong>DINEPLAN SNAPSHOT MAY BE OUT OF DATE. Upload a fresh Dineplan export before making a source-dependent correction.</strong></p>" : ""}<ol>${htmlItems}</ol>`;
  return { capacityPax, criticalCount, html, message, preShowEscalation, stale, subject, unresolvedCount: actions.length };
}
