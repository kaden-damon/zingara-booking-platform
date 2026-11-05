# Attendance Management & Notification Integrity

STATUS: COMPLETE - MIGRATED, DEPLOYED AND VERIFIED IN PRODUCTION

DATE: 5 NOVEMBER 2026

## Objective

Integrate authoritative guest attendance responses into Box Office operations
and restrict decline notifications to configured Box Office recipients without
changing arrival, booking, seating, ticket or financial state.

## Production Baseline

- `record_booking_attendance_response` already recorded Confirmed or Declined
  atomically, versioned changed answers and made unchanged retries idempotent.
- YES sent no immediate notification. NO used broad role-based in-app/device
  routing for Super Admin, Venue Manager, Box Office Manager and Box Office
  Staff. There was no decline email workflow or Staff Emails control.
- Floor & Arrivals displayed attendance badges but had no attendance filter.
  Bookings and Booking Details did not expose attendance filtering/status.
- Production contained 7,622 bookings with no recorded attendance response at
  audit time. No confirmed or declined Production response was altered.

## Implementation

- Registered `attendance-confirmations` in the existing Staff Emails registry
  and management-routed configuration. The established management permission,
  ON/OFF, Edit, TO/CC checkbox and Save Recipients controls are reused.
- Declines dispatch asynchronously with Next.js `after()`. The delivery claim
  uses booking ID plus response version, preventing duplicate email, in-app or
  device notifications for retries while permitting one notification for a
  genuinely changed later response.
- The branded email and Communications record use the existing infrastructure.
  In-app/device notifications accept explicit staff profile IDs; attendance
  declines have no role fallback. Confirmations remain silent.
- Bookings attendance filtering is part of the existing server-paginated RPC,
  request and Excel export query. Booking Details and Floor & Arrivals consume
  the same persisted attendance response and keep check-in independent.

## Recipient Correction

Authenticated Production verification exposed a stale pre-existing route with
management recipients. The original migration correctly defined four Box
Office recipients and an empty CC list but used `on conflict do nothing`, so it
did not overwrite that stale row.

`20261106003000_attendance_box_office_routing_correction.sql` now replaces only
the Attendance Confirmations route with:

- TO: Lisa Rodderick, Michael Davis, Rasmus Bjerregaard, Sharon Ricketts.
- CC: none.
- Status: ON.

The correction requires all four staff profiles to be active and fails rather
than storing a partial route. It does not alter any other email workflow.

## Verification

- 15 focused attendance, Staff Emails and booking-list tests passed.
- TypeScript and the Next.js 16 Production build passed.
- Admin performance budget passed: raw 1,290,287 / 1,320,000 bytes; gzip
  312,441 / 320,000 bytes; largest gzip chunk 168,485 / 170,000 bytes.
- Linked migration dry runs listed only the intended migrations; both applied
  successfully. A read-only Production query confirmed the exact four TO
  recipients, empty CC and enabled state.
- Authenticated Production UI verification confirmed:
  - Attendance Confirmations under Organisation Workflows with ON, Edit and
    recipient controls.
  - Bookings attendance filter and authoritative Awaiting Response results.
  - Booking Details attendance badge.
  - Arrivals & Check-in attendance filter, separate from arrival status.
- No real guest response or staff notification was generated in QA. Delivery
  behavior is supported by isolated tests and the existing durable outbox.

## Release Evidence

- Feature commit: `78041bc7df82a625d0618766c3ed97368740e10e`.
- Routing correction commit: `2c71b111a1e62be04531c91bb160ec84f5dd36fa`.
- Feature deployment: `dpl_HyGpP4dQZdqappism7vTxuRMKhkF`, READY.
- Corrective deployment: `dpl_96DhfWokipKao2fzeypK546GWMgL`, READY at
  5 November 2026, 23:40:23 SAST.
- Migrations:
  - `20261106001500_attendance_management_integration.sql`.
  - `20261106003000_attendance_box_office_routing_correction.sql`.

## Business-Data Delta

- Added and corrected one internal notification route.
- Added one index on `bookings.attendance_response` and replaced the existing
  bounded booking-list RPC with attendance-filter support.
- Zero booking, attendance response, arrival, payment, seating, ticket,
  customer communication or financial record changes.

## Rollback

Revert `2c71b111` and `78041bc7` and redeploy. Restore the prior booking-list
RPC only if attendance filtering is intentionally removed. Preserve all guest
attendance history and Communications evidence.
