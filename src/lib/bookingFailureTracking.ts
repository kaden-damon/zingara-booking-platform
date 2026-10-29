import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSafeJourneyId,
  recordPlatformEvent,
} from "@/lib/platformTelemetry";

export const publicBookingFailureReasons = [
  "application-error",
  "booking-cutoff",
  "booking-validation",
  "concurrency-conflict",
  "payment-initiation-failed",
  "show-closed",
  "show-sold-out",
  "two-seater-limit",
  "zone-capacity-exhausted",
  "zone-unavailable",
] as const;

export type PublicBookingFailureReason =
  (typeof publicBookingFailureReasons)[number];

type PublicBookingFailureInput = {
  bookingReference?: string | null;
  environment?: "development" | "preview" | "production";
  journeyId?: string | null;
  performanceDate?: string | null;
  performanceId?: string | null;
  quotedValue?: number | null;
  reason: PublicBookingFailureReason;
  requestedGuests?: number | null;
  seatingZone?: string | null;
  statusCode: number;
  venue?: string | null;
};

function boundedNumber(value: number | null | undefined, maximum: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(maximum, value))
    : null;
}

function text(value: string | null | undefined, maximum: number) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

export function buildPublicBookingFailureMetadata(
  input: PublicBookingFailureInput,
) {
  return {
    environment: input.environment ?? "production",
    failureReason: input.reason,
    performanceDate: text(input.performanceDate, 10),
    performanceId: text(input.performanceId, 80),
    quotedValue: boundedNumber(input.quotedValue, 10_000_000),
    requestedGuests: boundedNumber(input.requestedGuests, 10_000),
    section: text(input.seatingZone, 80),
    source: "server-authoritative",
    venue: text(input.venue, 80),
  };
}

export function recordPublicBookingFailureAfterResponse(
  client: SupabaseClient,
  input: PublicBookingFailureInput,
) {
  if (!input.journeyId || !isSafeJourneyId(input.journeyId)) return;

  const metadata = buildPublicBookingFailureMetadata(input);

  after(async () => {
    await recordPlatformEvent(
      {
        bookingReference: input.bookingReference ?? null,
        eventType: "booking_attempt_rejected",
        journeyId: input.journeyId,
        metadata,
        operation: "create_public_booking",
        route: "/api/bookings",
        safeFingerprint: `public_booking_${input.reason.replaceAll("-", "_")}`,
        severity: input.reason === "application-error" ? "error" : "warning",
        statusCode: input.statusCode,
      },
      client,
    );
  });
}

export function recordPaymentInitiationFailureAfterResponse(
  client: SupabaseClient,
  input: Omit<PublicBookingFailureInput, "reason">,
) {
  if (!input.journeyId || !isSafeJourneyId(input.journeyId)) return;

  after(async () => {
    const { data: booking } = input.bookingReference
      ? await client
          .from("bookings")
          .select("guest_count,show_id,total_amount,seating_zone,shows(date,venue)")
          .eq("booking_reference", input.bookingReference)
          .maybeSingle()
      : { data: null };
    const show = Array.isArray(booking?.shows)
      ? booking.shows[0]
      : booking?.shows;

    await recordPlatformEvent(
      {
        bookingReference: input.bookingReference ?? null,
        eventType: "booking_attempt_rejected",
        journeyId: input.journeyId,
        metadata: buildPublicBookingFailureMetadata({
          ...input,
          performanceDate: show?.date ?? input.performanceDate,
          performanceId: booking?.show_id ?? input.performanceId,
          quotedValue: booking?.total_amount ?? input.quotedValue,
          reason: "payment-initiation-failed",
          requestedGuests: booking?.guest_count ?? input.requestedGuests,
          seatingZone: booking?.seating_zone ?? input.seatingZone,
          venue: show?.venue ?? input.venue,
        }),
        operation: "prepare_payfast_checkout",
        route: "/api/payfast/checkout",
        safeFingerprint: "public_booking_payment_initiation_failed",
        severity: "warning",
        statusCode: input.statusCode,
      },
      client,
    );
  });
}
