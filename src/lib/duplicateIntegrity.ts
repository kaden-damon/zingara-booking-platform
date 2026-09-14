export type DuplicateConfidence = "exact" | "probable" | "possible";
export type DuplicateRecordType = "standard-booking" | "corporate-booking" | "corporate-enquiry";

export type DuplicateIntegrityRecord = {
  amount: number;
  amountPaid: number;
  bookingStatus: string;
  capacityPax: number;
  company: string;
  corporateImportFingerprint?: string | null;
  createdAt: string;
  createdBy: string;
  customer: string;
  customerIdentity: string;
  email: string;
  id: string;
  importFingerprint?: string | null;
  importSource?: string | null;
  mobile: string;
  outstanding: number;
  pax: number;
  recordType: DuplicateRecordType;
  reference: string;
  seatingZone: string;
  showId: string;
  showLabel: string;
  source: string;
  status: string;
  tableAssignments: string[];
  ticketCount: number;
};

export type DuplicateIntegrityGroup = {
  capacityImpact: number;
  confidence: DuplicateConfidence;
  id: string;
  records: DuplicateIntegrityRecord[];
  whyFlagged: string;
};

const activeBookingStatuses = new Set([
  "new",
  "confirmed",
  "pending-payment",
  "pending_payment",
  "checked-in",
  "checked_in",
]);

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function minutesBetween(records: DuplicateIntegrityRecord[]) {
  const times = records.map((record) => Date.parse(record.createdAt));
  return (Math.max(...times) - Math.min(...times)) / 60_000;
}

function groupBy(
  records: DuplicateIntegrityRecord[],
  keyFor: (record: DuplicateIntegrityRecord) => string,
) {
  const groups = new Map<string, DuplicateIntegrityRecord[]>();

  for (const record of records) {
    const key = keyFor(record);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  return groups;
}

function capacityImpact(records: DuplicateIntegrityRecord[]) {
  const active = records.filter(
    (record) =>
      record.recordType !== "corporate-enquiry" &&
      activeBookingStatuses.has(record.bookingStatus),
  );

  if (active.length < 2) return 0;
  return Math.max(
    active.reduce((total, record) => total + record.capacityPax, 0) -
      Math.max(...active.map((record) => record.capacityPax)),
    0,
  );
}

function candidate(
  confidence: DuplicateConfidence,
  key: string,
  records: DuplicateIntegrityRecord[],
  whyFlagged: string,
): DuplicateIntegrityGroup {
  return {
    capacityImpact: capacityImpact(records),
    confidence,
    id: `${confidence}:${key}`,
    records: [...records].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    ),
    whyFlagged,
  };
}

export function buildDuplicateIntegrityGroups(
  records: DuplicateIntegrityRecord[],
) {
  const results: DuplicateIntegrityGroup[] = [];
  const claimedRecordIds = new Set<string>();
  const enquiries = records.filter(
    (record) => record.recordType === "corporate-enquiry",
  );
  const bookings = records.filter(
    (record) => record.recordType !== "corporate-enquiry",
  );

  for (const [fingerprint, matches] of groupBy(
    enquiries,
    (record) => record.importFingerprint?.trim() ?? "",
  )) {
    if (matches.length < 2) continue;
    results.push(
      candidate(
        "exact",
        `enquiry:${fingerprint}`,
        matches,
        "Exact import fingerprint, checksum and source-row identity match.",
      ),
    );
    matches.forEach((record) => claimedRecordIds.add(record.id));
  }

  for (const [fingerprint, matches] of groupBy(
    bookings,
    (record) => record.corporateImportFingerprint?.trim() ?? "",
  )) {
    if (matches.length < 2) continue;
    results.push(
      candidate(
        "exact",
        `corporate-booking:${fingerprint}`,
        matches,
        "Bookings descend from enquiries with the same exact import identity.",
      ),
    );
    matches.forEach((record) => claimedRecordIds.add(record.id));
  }

  const activeBookings = bookings.filter(
    (record) =>
      activeBookingStatuses.has(record.bookingStatus) &&
      !claimedRecordIds.has(record.id),
  );
  const strongGroups = groupBy(activeBookings, (record) =>
    [
      record.customerIdentity,
      record.showId,
      normalized(record.seatingZone),
      record.pax,
      record.amount.toFixed(2),
    ].join("|"),
  );

  for (const [key, matches] of strongGroups) {
    const ageMinutes = minutesBetween(matches);
    if (matches.length < 2 || ageMinutes > 30) continue;
    const hasUnpaidResidue = matches.some(
      (record) =>
        record.amountPaid === 0 &&
        /pending/.test(record.status) &&
        record.ticketCount === 0,
    );
    const hasPaidRecord = matches.some((record) => record.amountPaid > 0);
    const confidence =
      ageMinutes <= 5 && hasUnpaidResidue && hasPaidRecord
        ? "exact"
        : "probable";
    results.push(
      candidate(
        confidence,
        `booking:${key}`,
        matches,
        confidence === "exact"
          ? `Same customer, performance, pax, zone and obligation created ${Math.round(ageMinutes * 60)} seconds apart; the unpaid record has no ticket.`
          : `Same customer, performance, pax, zone and obligation created ${Math.round(ageMinutes)} minutes apart.`,
      ),
    );
    matches.forEach((record) => claimedRecordIds.add(record.id));
  }

  const possibleGroups = groupBy(
    bookings.filter(
      (record) =>
        activeBookingStatuses.has(record.bookingStatus) &&
        !claimedRecordIds.has(record.id),
    ),
    (record) =>
      [
        record.customerIdentity,
        record.showId,
        normalized(record.seatingZone),
      ].join("|"),
  );

  for (const [key, matches] of possibleGroups) {
    if (matches.length < 2 || minutesBetween(matches) > 72 * 60) continue;
    results.push(
      candidate(
        "possible",
        `booking:${key}`,
        matches,
        "Same customer, performance and seating zone within 72 hours; details differ and require human review.",
      ),
    );
  }

  const rank: Record<DuplicateConfidence, number> = {
    exact: 0,
    probable: 1,
    possible: 2,
  };

  return results.sort(
    (left, right) =>
      rank[left.confidence] - rank[right.confidence] ||
      right.capacityImpact - left.capacityImpact ||
      left.id.localeCompare(right.id),
  );
}
