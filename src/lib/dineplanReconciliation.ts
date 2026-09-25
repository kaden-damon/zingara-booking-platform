import { createHash } from "node:crypto";
import { getCorporateSeatingZoneId } from "./corporateZoneMapping.ts";

export type DineplanClassification =
  | "matched"
  | "zingara_newer"
  | "dineplan_newer"
  | "review";

export type DineplanSeverity = "critical" | "normal";

export type DineplanReservation = {
  company: string | null;
  guestName: string;
  mobile: string | null;
  notes: string | null;
  paymentText: string | null;
  performanceDate: string;
  performanceTime: string | null;
  pax: number;
  raw: Record<string, string>;
  rowNumber: number;
  seatingZone: string | null;
  sourceReference: string | null;
  sourceUpdatedAt: string | null;
  status: "cancelled" | "confirmed" | "other";
  tables: string[];
};

export type DineplanSnapshot = {
  checksum: string;
  covers: number;
  generatedAt: string | null;
  quality: DineplanParseQuality;
  performanceDate: string | null;
  performanceTime: string | null;
  reservations: DineplanReservation[];
  venue: "cape-town" | "johannesburg" | null;
};

export type DineplanParseQuality = {
  duplicateRows: number;
  malformedIdentities: number;
  missingContactFields: number;
  parserTrusted: boolean;
  sourceCovers: number | null;
  sourceReservations: number | null;
  warnings: string[];
};

export type DineplanReconciliationQuality = {
  deterministicMatches: number;
  reasons: string[];
  status: "review_required" | "trusted";
  trusted: boolean;
};

export type ZingaraAuthoritativeChange = {
  at: string;
  fields: Array<"pax" | "payment" | "performance" | "status" | "table" | "zone">;
  reason: string;
};

export type ZingaraReconciliationBooking = {
  amountPaid: number;
  archivedAt: string | null;
  bookingOrigin: string | null;
  bookingReference: string;
  bookingStatus: string;
  bookingKind: "corporate" | "standard";
  company: string | null;
  customerEmail?: string | null;
  customerFirstName?: string | null;
  customerName: string;
  customerSurname?: string | null;
  id: string;
  importedAt: string | null;
  mobile: string | null;
  outstanding: number;
  partySize: number;
  paymentStatus: string;
  performanceDate: string;
  performanceTime: string;
  seatingZone: string | null;
  sourceReference: string | null;
  tables: string[];
  totalAmount: number;
  updatedAt: string;
  authoritativeChanges: ZingaraAuthoritativeChange[];
};

export type DineplanReconciliationResult = {
  capacityImpact: number;
  classification: DineplanClassification;
  differences: string[];
  dineplan: DineplanReservation | null;
  matchConfidence: "exact" | "high" | "possible" | "unmatched";
  matchReason: string;
  reason: string;
  severity: DineplanSeverity;
  zingara: ZingaraReconciliationBooking | null;
};

const activeStatuses = new Set([
  "confirmed",
  "new",
  "pending",
  "pending_payment",
  "checked_in",
]);

function normalized(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedReference(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizedPhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-9) : "";
}

function normalizedTime(value: string | null | undefined) {
  const match = (value ?? "").match(/\b(\d{1,2})[:hH](\d{2})\b/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function normalizedDate(value: string | null | undefined) {
  const input = (value ?? "").trim();
  if (!input) return null;
  const direct = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (direct) return input;
  const local = input.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (local) {
    const year = local[3].length === 2 ? `20${local[3]}` : local[3];
    return `${year}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
  }
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function normalizedStatus(value: string | null | undefined) {
  const status = normalized(value);
  if (status.includes("cancel") || status.includes("deleted")) return "cancelled";
  if (status.includes("active") || status.includes("confirm") || !status) return "confirmed";
  return "other";
}

function normalizedPayment(value: string | null | undefined) {
  const payment = normalized(value);
  if (!payment) return null;
  if (payment.includes("refund")) return "refunded";
  if (payment.includes("deposit")) return "deposit_paid";
  if (payment.includes("paid in full") || payment.includes("fully paid")) return "fully_paid";
  if (payment.includes("not paid") || payment.includes("unpaid") || payment.includes("pending")) return "pending_payment";
  if (payment === "paid") return "fully_paid";
  return null;
}

function normalizedTimestamp(value: string | null | undefined) {
  const input = (value ?? "").trim();
  if (!input) return null;
  const local = input.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (local) {
    const year = local[3].length === 2 ? `20${local[3]}` : local[3];
    return `${year}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}T${(local[4] ?? "00").padStart(2, "0")}:${local[5] ?? "00"}:00+02:00`;
  }
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getValue(record: Record<string, string>, ...keys: string[]) {
  const normalizedRecord = new Map(
    Object.entries(record).map(([key, value]) => [normalized(key), value?.trim() ?? ""]),
  );
  for (const key of keys) {
    const value = normalizedRecord.get(normalized(key));
    if (value) return value;
  }
  return "";
}

function parsePax(value: string) {
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(Math.trunc(parsed), 0) : 0;
}

function splitTables(value: string) {
  return value
    .split(/[,+/&]|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

export function normalizeDineplanReservation(
  record: Record<string, string>,
  rowNumber: number,
): DineplanReservation {
  const sourceReference = getValue(record, "Booking Reference", "Reference", "Booking Ref");
  const statusText = getValue(record, "Booking Status", "Status", "Cancelled");
  return {
    company: getValue(record, "Company", "Group") || null,
    guestName: getValue(record, "Guest Name", "Guest", "Customer", "Name"),
    mobile: getValue(record, "Telephone", "Mobile", "Contact Number", "Phone") || null,
    notes: getValue(record, "Notes", "Booking Notes", "Special Requests") || null,
    paymentText: getValue(record, "Payment", "Payment Status", "Payment Notes") || null,
    performanceDate:
      normalizedDate(getValue(record, "Show Date", "Booking Date", "Date")) ?? "",
    performanceTime: normalizedTime(getValue(record, "Time", "Show Time")),
    pax: parsePax(getValue(record, "Pax", "Covers", "Guests")),
    raw: record,
    rowNumber,
    seatingZone: getValue(record, "Seating", "Seating Area", "Zone", "Section") || null,
    sourceReference: sourceReference || null,
    sourceUpdatedAt: normalizedTimestamp(
      getValue(record, "Last Modified", "Updated", "Modified At", "Changed At"),
    ),
    status: normalizedStatus(statusText),
    tables: splitTables(getValue(record, "Table", "Tables", "Table(s)")),
  };
}

export function parseDelimitedRows(text: string, delimiter = ",") {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      field = "";
      row = [];
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("The uploaded CSV contains an unclosed quoted value.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function recordsFromRows(rows: string[][]) {
  const headerIndex = rows.findIndex((row) => {
    const values = row.map(normalized);
    return (
      values.some((value) => ["guest", "guest name", "customer", "name"].includes(value)) &&
      values.some((value) => ["pax", "covers", "guests"].includes(value))
    );
  });
  if (headerIndex < 0) {
    throw new Error("The Dineplan reservation headers could not be detected.");
  }
  const headers = rows[headerIndex];
  return rows
    .slice(headerIndex + 1)
    .filter((row) => row.some(Boolean))
    .map((row) =>
      headers.reduce<Record<string, string>>((record, header, index) => {
        record[header || `Column ${index + 1}`] = row[index]?.trim() ?? "";
        return record;
      }, {}),
    );
}

export function snapshotFromRecords(input: {
  bytes: Buffer;
  generatedAt?: string | null;
  quality?: Partial<DineplanParseQuality>;
  records: Record<string, string>[];
  venue?: "cape-town" | "johannesburg" | null;
}): DineplanSnapshot {
  const reservations = input.records
    .map((record, index) => normalizeDineplanReservation(record, index + 1))
    .filter((row) => row.guestName || row.company || row.sourceReference);
  const dates = [...new Set(reservations.map((row) => row.performanceDate).filter(Boolean))];
  const times = [...new Set(reservations.map((row) => row.performanceTime).filter(Boolean))];
  const identityKeys = reservations.map((row) => [
    normalizedReference(row.sourceReference),
    normalizedPhone(row.mobile),
    normalized(row.guestName),
    row.performanceDate,
    row.performanceTime,
    row.pax,
    row.tables.join("+"),
  ].join("|"));
  const duplicateRows = identityKeys.length - new Set(identityKeys).size;
  const malformedIdentities = reservations.filter((row) =>
    row.pax <= 0 || normalized(row.guestName || row.company).length < 3
  ).length;
  const missingContactFields = reservations.filter((row) => !normalizedPhone(row.mobile)).length;
  const sourceReservations = input.quality?.sourceReservations ?? null;
  const sourceCovers = input.quality?.sourceCovers ?? null;
  const warnings = [...(input.quality?.warnings ?? [])];
  if (sourceReservations !== null && sourceReservations !== reservations.length) {
    warnings.push(`Source summary reports ${sourceReservations} reservations but ${reservations.length} rows were parsed.`);
  }
  const covers = reservations.reduce((total, row) => total + row.pax, 0);
  if (sourceCovers !== null && sourceCovers !== covers) {
    warnings.push(`Source summary reports ${sourceCovers} covers but ${covers} covers were parsed.`);
  }
  if (duplicateRows > 0) warnings.push(`${duplicateRows} duplicate reservation row${duplicateRows === 1 ? " was" : "s were"} detected.`);
  if (malformedIdentities > 0) warnings.push(`${malformedIdentities} reservation identit${malformedIdentities === 1 ? "y requires" : "ies require"} review.`);
  if (sourceReservations !== null && reservations.length >= 10 && missingContactFields > reservations.length / 2) {
    warnings.push(`${missingContactFields} of ${reservations.length} reservations are missing usable contact identity evidence.`);
  }
  const parserTrusted = input.quality?.parserTrusted !== false && warnings.length === 0;
  return {
    checksum: createHash("sha256").update(input.bytes).digest("hex"),
    covers,
    generatedAt: input.generatedAt ?? null,
    performanceDate: dates.length === 1 ? dates[0] : null,
    performanceTime: times.length === 1 ? times[0] : null,
    quality: {
      duplicateRows,
      malformedIdentities,
      missingContactFields,
      parserTrusted,
      sourceCovers,
      sourceReservations,
      warnings,
    },
    reservations,
    venue: input.venue ?? null,
  };
}

function zonesMatch(left: string | null, right: string | null) {
  if (!left || !right) return true;
  const canonical = (value: string) => getCorporateSeatingZoneId(
    value
      .replace(/\bR\s*\d+(?:[.,]\d+)?\s*(?:pp|p\/p|per\s+person)?\b/gi, "")
      .replace(/\braised\b/gi, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  const leftZone = canonical(left);
  const rightZone = canonical(right);
  if (leftZone && rightZone) return leftZone === rightZone;
  return normalized(left) === normalized(right);
}

function tablesMatch(left: string[], right: string[]) {
  if (!left.length || !right.length) return true;
  return normalized(left.join("+")) === normalized(right.join("+"));
}

function collapseRepeatedIdentity(value: string) {
  const tokens = normalized(value).split(" ").filter(Boolean);
  if (tokens.length >= 2 && tokens.length % 2 === 0) {
    const midpoint = tokens.length / 2;
    if (tokens.slice(0, midpoint).join(" ") === tokens.slice(midpoint).join(" ")) {
      return tokens.slice(0, midpoint);
    }
  }
  return tokens;
}

function importedIdentityMatches(
  source: DineplanReservation,
  candidate: ZingaraReconciliationBooking,
) {
  if (candidate.bookingOrigin !== "data_import") return false;
  if (candidate.performanceDate !== source.performanceDate || candidate.partySize !== source.pax) return false;
  if (!zonesMatch(source.seatingZone, candidate.seatingZone)) return false;

  const sourceTokens = collapseRepeatedIdentity(source.guestName);
  if (sourceTokens.length < 2) return false;
  const sourceFirst = sourceTokens[0];
  const sourceSurname = sourceTokens.slice(1).join(" ");

  const storedFirst = normalized(candidate.customerFirstName);
  let surnameTokens = normalized(candidate.customerSurname).split(" ").filter(Boolean);
  const storedFirstTokens = storedFirst.includes(" ") || storedFirst.includes("@")
    ? []
    : storedFirst.split(" ").filter(Boolean);
  if (
    storedFirstTokens.length > 0 &&
    surnameTokens.slice(0, storedFirstTokens.length).join(" ") === storedFirstTokens.join(" ")
  ) {
    surnameTokens = surnameTokens.slice(storedFirstTokens.length);
  }
  if (surnameTokens.at(-1)?.length === 1) surnameTokens = surnameTokens.slice(0, -1);
  if (!surnameTokens.length || surnameTokens.join(" ") !== sourceSurname) return false;

  const emailLocal = (candidate.customerEmail ?? candidate.customerFirstName ?? "")
    .split("@", 1)[0]
    .replace(/\d+$/g, "");
  const candidateFirst = normalized(candidate.customerFirstName?.includes("@") ? emailLocal : candidate.customerFirstName)
    .split(" ")[0];
  return candidateFirst === sourceFirst || (
    candidateFirst.startsWith(sourceFirst) && candidateFirst.length - sourceFirst.length <= 2
  );
}

function findMatch(
  source: DineplanReservation,
  candidates: ZingaraReconciliationBooking[],
) {
  const sourceRef = normalizedReference(source.sourceReference);
  if (sourceRef) {
    const exact = candidates.filter((candidate) =>
      [candidate.bookingReference, candidate.sourceReference].some(
        (value) => normalizedReference(value) === sourceRef,
      ),
    );
    if (exact.length === 1) {
      return { booking: exact[0], confidence: "exact" as const, reason: "Legacy/source reference" };
    }
  }
  const phone = normalizedPhone(source.mobile);
  if (phone) {
    const phoneMatches = candidates.filter(
      (candidate) =>
        normalizedPhone(candidate.mobile) === phone &&
        candidate.performanceDate === source.performanceDate,
    );
    if (phoneMatches.length === 1) {
      return { booking: phoneMatches[0], confidence: "high" as const, reason: "Mobile and performance date" };
    }
  }
  const importedIdentityMatchesForShow = candidates.filter((candidate) =>
    importedIdentityMatches(source, candidate)
  );
  if (importedIdentityMatchesForShow.length === 1) {
    return {
      booking: importedIdentityMatchesForShow[0],
      confidence: "high" as const,
      reason: "Unique imported identity, performance, pax and zone",
    };
  }
  const identity = normalized(source.company || source.guestName);
  const possible = candidates.filter(
    (candidate) =>
      [candidate.company, candidate.customerName].some(
        (value) => normalized(value) === identity,
      ) && candidate.performanceDate === source.performanceDate,
  );
  if (possible.length === 1) {
    return { booking: possible[0], confidence: "possible" as const, reason: "Name and performance date require review" };
  }
  return { booking: null, confidence: "unmatched" as const, reason: "No deterministic match" };
}

function latestRelevantChange(
  booking: ZingaraReconciliationBooking,
  fields: ZingaraAuthoritativeChange["fields"],
) {
  return booking.authoritativeChanges
    .filter((change) => change.fields.some((field) => fields.includes(field)))
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))[0];
}

export function reconcileDineplanSnapshot(
  snapshot: DineplanSnapshot,
  bookings: ZingaraReconciliationBooking[],
) {
  const unmatchedBookingIds = new Set(bookings.map((booking) => booking.id));
  const results: DineplanReconciliationResult[] = snapshot.reservations.map((source) => {
    const match = findMatch(source, bookings);
    const booking = match.booking;
    if (!booking || match.confidence === "possible") {
      if (booking) unmatchedBookingIds.delete(booking.id);
      return {
        capacityImpact: 0,
        classification: "review",
        differences: [booking ? "Identity match is not authoritative" : "Booking missing from Zingara"],
        dineplan: source,
        matchConfidence: match.confidence,
        matchReason: match.reason,
        reason: booking
          ? "A name-only candidate was found, but staff must verify the identity."
          : "No authoritative Zingara booking could be matched.",
        severity: !booking && source.status === "confirmed" ? "critical" : "normal",
        zingara: booking,
      };
    }
    unmatchedBookingIds.delete(booking.id);
    const differences: string[] = [];
    const fields: ZingaraAuthoritativeChange["fields"] = [];
    if (source.pax !== booking.partySize) {
      differences.push(`Pax ${source.pax} / ${booking.partySize}`);
      fields.push("pax");
    }
    const sourceCancelled = source.status === "cancelled";
    const zingaraCancelled = booking.bookingStatus === "cancelled" || Boolean(booking.archivedAt);
    if (sourceCancelled !== zingaraCancelled) {
      differences.push(`Status ${source.status} / ${booking.bookingStatus}`);
      fields.push("status");
    }
    if (source.performanceDate && source.performanceDate !== booking.performanceDate) {
      differences.push(`Performance ${source.performanceDate} / ${booking.performanceDate}`);
      fields.push("performance");
    }
    if (!zonesMatch(source.seatingZone, booking.seatingZone)) {
      differences.push(`Zone ${source.seatingZone ?? "Not stated"} / ${booking.seatingZone ?? "Not stated"}`);
      fields.push("zone");
    }
    if (!tablesMatch(source.tables, booking.tables)) {
      differences.push(`Table ${source.tables.join("+") || "Not stated"} / ${booking.tables.join("+") || "Unassigned"}`);
      fields.push("table");
    }
    const sourcePayment = normalizedPayment(source.paymentText);
    const zingaraPayment = normalizedPayment(booking.paymentStatus);
    if (sourcePayment && zingaraPayment && sourcePayment !== zingaraPayment) {
      differences.push(`Payment wording ${source.paymentText} / ${booking.paymentStatus}`);
      fields.push("payment");
    }
    if (!differences.length) {
      return {
        capacityImpact: 0,
        classification: "matched",
        differences,
        dineplan: source,
        matchConfidence: match.confidence,
        matchReason: match.reason,
        reason: "Comparable reservation state agrees.",
        severity: "normal",
        zingara: booking,
      };
    }
    const laterZingaraChange = latestRelevantChange(booking, fields);
    const sourceChangedAt = source.sourceUpdatedAt ? Date.parse(source.sourceUpdatedAt) : Number.NaN;
    const zingaraChangedAt = laterZingaraChange ? Date.parse(laterZingaraChange.at) : Number.NaN;
    const dineplanIsReliablyLater =
      Number.isFinite(sourceChangedAt) &&
      (!Number.isFinite(zingaraChangedAt) || sourceChangedAt > zingaraChangedAt);
    const classification: DineplanClassification = laterZingaraChange
      ? "zingara_newer"
      : dineplanIsReliablyLater
        ? "dineplan_newer"
        : "review";
    const capacityImpact =
      sourceCancelled && activeStatuses.has(booking.bookingStatus) ? booking.partySize : 0;
    const severity =
      capacityImpact > 0 || fields.some((field) => ["pax", "performance", "status", "zone"].includes(field))
        ? "critical"
        : "normal";
    return {
      capacityImpact,
      classification,
      differences,
      dineplan: source,
      matchConfidence: match.confidence,
      matchReason: match.reason,
      reason:
        classification === "zingara_newer"
          ? laterZingaraChange?.reason ?? "Later authoritative Zingara activity explains the difference."
          : classification === "dineplan_newer"
            ? "The Dineplan row has a later source timestamp and requires operational review."
            : fields.includes("payment")
              ? "Dineplan payment wording is comparison evidence only; authoritative Zingara payment evidence does not agree."
              : "Chronology does not safely establish which state is newer.",
      severity,
      zingara: booking,
    };
  });

  for (const booking of bookings) {
    if (!unmatchedBookingIds.has(booking.id) || booking.bookingOrigin !== "data_import") continue;
    results.push({
      capacityImpact: activeStatuses.has(booking.bookingStatus) ? booking.partySize : 0,
      classification: "review",
      differences: ["Zingara legacy booking missing from this Dineplan snapshot"],
      dineplan: null,
      matchConfidence: "unmatched",
      matchReason: "No source row in this point-in-time snapshot",
      reason: "Absence from one snapshot is not treated as cancellation.",
      severity: "normal",
      zingara: booking,
    });
  }

  const counts = results.reduce<Record<string, number>>((totals, result) => {
    totals[result.classification] = (totals[result.classification] ?? 0) + 1;
    if (result.severity === "critical") totals.critical = (totals.critical ?? 0) + 1;
    return totals;
  }, {});
  const zingaraEntitlement = bookings
    .filter((booking) => activeStatuses.has(booking.bookingStatus) && !booking.archivedAt)
    .reduce((total, booking) => total + booking.partySize, 0);

  return {
    bridge: {
      difference: zingaraEntitlement - snapshot.covers,
      dineplanCovers: snapshot.covers,
      explainedByRows: results
        .filter((result) => result.dineplan?.pax !== result.zingara?.partySize)
        .map((result) => ({
          bookingReference: result.zingara?.bookingReference ?? null,
          classification: result.classification,
          delta: (result.zingara?.partySize ?? 0) - (result.dineplan?.pax ?? 0),
          guest: result.dineplan?.guestName || result.zingara?.customerName || "Unmatched",
        })),
      zingaraEntitlement,
    },
    counts,
    quality: assessDineplanReconciliationTrust(snapshot, results),
    results,
  };
}

export function assessDineplanReconciliationTrust(
  snapshot: DineplanSnapshot,
  results: DineplanReconciliationResult[],
): DineplanReconciliationQuality {
  const reasons = [...snapshot.quality.warnings];
  if (!snapshot.quality.parserTrusted) reasons.push("The parsed source failed reservation integrity checks.");
  const sourceRows = results.filter((result) => result.dineplan);
  const deterministicMatches = sourceRows.filter((result) =>
    result.matchConfidence === "exact" || result.matchConfidence === "high"
  ).length;
  const stableIdentities = snapshot.reservations.filter((row) =>
    Boolean(normalizedReference(row.sourceReference) || normalizedPhone(row.mobile))
  ).length;
  const catastrophicCollapse =
    snapshot.reservations.length >= 10 &&
    stableIdentities >= Math.ceil(snapshot.reservations.length * 0.8) &&
    deterministicMatches === 0;
  if (catastrophicCollapse) {
    reasons.push(`${stableIdentities} reservations contain stable identity evidence, but none matched deterministically.`);
  }
  const trusted = reasons.length === 0;
  return {
    deterministicMatches,
    reasons,
    status: trusted ? "trusted" : "review_required",
    trusted,
  };
}
