import type { BookingOrigin, BookingSource } from "@/lib/zingaraDemo";
import { createHmac, timingSafeEqual } from "node:crypto";

export type BookingCreationProvenance = {
  bookingOrigin: BookingOrigin;
  createdByStaffId?: string;
};

export type HistoricalBookingEvidence = {
  dataImportCreatorId?: string | null;
  hasCustomerPublicLifecycleEvent?: boolean;
  staffCreatorId?: string | null;
};

const internalHandoffMaxAgeMs = 60_000;

export function signInternalBookingHandoff(input: {
  body: string;
  secret: string;
  staffProfileId: string;
  timestamp: string;
}) {
  return createHmac("sha256", input.secret)
    .update(`${input.timestamp}.${input.staffProfileId}.${input.body}`)
    .digest("hex");
}

export function verifyInternalBookingHandoff(input: {
  body: string;
  now?: number;
  secret: string;
  signature: string;
  staffProfileId: string;
  timestamp: string;
}) {
  const timestamp = Number(input.timestamp);

  if (
    !Number.isFinite(timestamp) ||
    Math.abs((input.now ?? Date.now()) - timestamp) > internalHandoffMaxAgeMs
  ) {
    return false;
  }

  const expected = signInternalBookingHandoff(input);
  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(input.signature, "hex");

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export function resolveTrustedBookingSource(input: {
  requestedSource?: BookingSource;
  staffProfileId?: string | null;
}): BookingSource {
  return input.staffProfileId ? input.requestedSource ?? "admin" : "online";
}

export function resolveBookingCreationProvenance(input: {
  bookingSource?: BookingSource;
  staffProfileId?: string | null;
}): BookingCreationProvenance {
  if (!input.staffProfileId) {
    return { bookingOrigin: "customer_public" };
  }

  if (input.bookingSource === "corporate-direct") {
    return {
      bookingOrigin: "corporate",
      createdByStaffId: input.staffProfileId,
    };
  }

  if (input.bookingSource === "waitlist") {
    return {
      bookingOrigin: "other",
      createdByStaffId: input.staffProfileId,
    };
  }

  return {
    bookingOrigin: "admin_staff",
    createdByStaffId: input.staffProfileId,
  };
}

export function classifyHistoricalBookingProvenance(
  evidence: HistoricalBookingEvidence,
): BookingCreationProvenance {
  if (evidence.dataImportCreatorId) {
    return {
      bookingOrigin: "data_import",
      createdByStaffId: evidence.dataImportCreatorId,
    };
  }

  if (evidence.hasCustomerPublicLifecycleEvent) {
    return { bookingOrigin: "customer_public" };
  }

  if (evidence.staffCreatorId) {
    return {
      bookingOrigin: "admin_staff",
      createdByStaffId: evidence.staffCreatorId,
    };
  }

  return { bookingOrigin: "legacy_unknown" };
}

export function hasImmutableProvenanceChanged(
  existing: BookingCreationProvenance,
  proposed: BookingCreationProvenance,
) {
  return (
    existing.bookingOrigin !== proposed.bookingOrigin ||
    (existing.createdByStaffId ?? null) !==
      (proposed.createdByStaffId ?? null)
  );
}
