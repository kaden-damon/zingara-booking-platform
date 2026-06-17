# Supabase Migration Progress

Last updated: 2026-06-17

## Current Status

The Supabase migration is in Phase 2E. The database schema has been created in migration files, and the application now has a shared Supabase data access layer for several core domains. The app still keeps localStorage fallback behaviour while modules are migrated incrementally.

The current active investigation is a booking insert failure after Phase 2E. Temporary diagnostics have been added around the Supabase booking insert path to capture the exact payload, `customerId`, `showId`, mapper result, and full Supabase error response.

## Phase 1: Schema Creation

Status: Complete in repository.

Files:

- `supabase/migrations/202606170001_phase_1_core_schema.sql`
- `supabase/MIGRATION_ORDER.md`

Created schema coverage:

- `customers`
- `shows`
- `venue_tables`
- `show_tables`
- `bookings`
- `tickets`
- `communications`
- `communication_batches`
- `waitlist_entries`
- `payments`
- `booking_lifecycle_events`
- `ticket_validations`
- `corporate_requests`
- `communication_templates`
- `venue_settings`
- `staff_profiles`
- `roles`
- `permissions`
- `role_permissions`

Created enum coverage:

- `booking_status`
- `payment_status`
- `show_status`
- `communication_type`
- `communication_channel`
- `ticket_status`
- `table_status`
- `waitlist_status`
- `payment_type`
- `validation_result`
- `corporate_request_status`
- `corporate_request_type`

Important note:

- Phase 1 created migration files only. Applying the migrations to the live Supabase project must be done separately with the Supabase CLI or SQL editor.

## Phase 2A: Shows

Status: Implemented.

Service:

- `src/lib/supabase/shows.ts`

Implemented:

- Shared Supabase-backed show reads and writes.
- LocalStorage fallback if Supabase has no rows or cannot be reached.
- Legacy app show IDs preserved in `shows.notes` metadata.
- Show consumers updated across booking/admin workflows.

Known follow-up:

- Supabase permissions were required for `shows`.
- For the migration phase, `anon` required CRUD grants and RLS was temporarily disabled for this table.

## Phase 2B: Venue Settings and Communication Templates

Status: Implemented.

Services:

- `src/lib/supabase/venueSettings.ts`
- `src/lib/supabase/communicationTemplates.ts`

Implemented:

- Venue settings read/write service.
- Communication template read/write service.
- LocalStorage fallback and seed behaviour.
- Existing template types preserved, including reservation and corporate messaging templates.

Known follow-up:

- Supabase permissions were required for `venue_settings` and `communication_templates`.
- For the migration phase, `anon` required CRUD grants and RLS was temporarily disabled for these tables.

## Phase 2C: Customers

Status: Implemented.

Service:

- `src/lib/supabase/customers.ts`

Implemented:

- `getCustomers()`
- `getCustomer()`
- `createCustomer()`
- `updateCustomer()`
- `upsertCustomer()`
- `upsertCustomerFromInfo()`
- `getOrCreateCustomerIdFromInfo()`

Integrated areas:

- CRM customer loading.
- CRM save paths.
- Booking customer creation/upsert.
- Corporate request conversion customer linkage.

Current boundary:

- Bookings, communications, and derived history still depend partly on local/demo metadata until their migration is complete.

## Phase 2D: Bookings

Status: Partially implemented.

Service:

- `src/lib/supabase/bookings.ts`

Implemented:

- `getBookings()`
- `getBooking()`
- `createBooking()`
- `updateBooking()`
- `deleteBooking()`
- `saveBookings()`
- `getSupabaseBookingId()`

Implemented behaviour:

- Booking records are saved to localStorage first.
- Supabase persistence is attempted after local save.
- Customer relation is resolved through the customer upsert service.
- Show relation is resolved using Supabase show IDs, legacy show metadata, generated show IDs, and booking date/time fallback.
- Full `DemoBooking` metadata is preserved in `bookings.notes` under a temporary metadata prefix.

Known issue:

- If Supabase contains any booking rows, `getBookings()` currently returns Supabase rows only. Local-only bookings can therefore disappear from Admin if their Supabase insert failed.

Previously fixed:

- A show mapping issue prevented booking inserts when `booking.showId` did not resolve to `shows.id`.

Current risk:

- The localStorage fallback is asymmetric: writes still save locally, but reads prefer Supabase once Supabase has rows.

## Phase 2E: Tickets and Payments

Status: Implemented, under investigation.

Services:

- `src/lib/supabase/tickets.ts`
- `src/lib/supabase/payments.ts`

Implemented:

- Ticket service functions:
  - `getTickets()`
  - `getTicket()`
  - `createTicket()`
  - `updateTicket()`
- Payment service functions:
  - `getPayments()`
  - `getPayment()`
  - `createPayment()`
  - `updatePayment()`

Integrated areas:

- Booking completion attempts to create booking, then payment and ticket.
- Admin payment controls attempt to update payment and ticket records.
- Live ticket lookup reads through the booking service.

Important dependency:

- Payment and ticket creation depend on resolving the Supabase booking row with `getSupabaseBookingId(booking.reference)`.
- If the booking insert fails, payment and ticket creation return early because there is no Supabase `booking_id`.

Current active failure:

- Booking reference `ZNG-MQI7LY3L-901` completed in the UI but did not appear in:
  - Supabase `bookings`
  - Supabase `payments`
  - Supabase `tickets`
  - Admin Bookings

Current diagnosis:

- `createBooking()` still runs.
- LocalStorage save still runs.
- Payment and ticket failures are downstream.
- Booking insert failure is the root issue.
- Temporary diagnostics have been added around `bookings.insert()` to capture the exact Supabase error on the next booking attempt.

Temporary diagnostics added:

- Relation mapping log:
  - booking reference
  - source show ID
  - resolved `customerId`
  - resolved `showId`
  - booking date
- Mapper failure log when `toSupabaseBooking()` returns `undefined`.
- Insert payload log immediately before `bookings.insert()`.
- Full Supabase insert error log if insertion fails.

## Supabase Permissions Status

Confirmed migration-phase pattern:

- Tables used by browser-side Supabase services require `anon` CRUD grants while the app still uses the public anon client.
- RLS has been temporarily disabled for migrated tables during this incremental migration.

Known required tables so far:

- `shows`
- `venue_settings`
- `communication_templates`
- `customers`
- `bookings`
- `payments`
- `tickets`

Important:

- This is acceptable only as a temporary migration/testing state.
- Before production, RLS must be re-enabled with proper policies, and staff/customer access must be routed through the final auth model.

## Current Data Flow

### Shows

Supabase is primary, localStorage is fallback.

### Venue Settings

Supabase is primary, localStorage is fallback.

### Communication Templates

Supabase is primary, localStorage is fallback.

### Customers

Supabase is primary for migrated CRM paths, localStorage fallback remains.

### Bookings

LocalStorage write occurs first, Supabase write is attempted after.

Read behaviour currently prefers Supabase once rows exist, which can hide local-only bookings if Supabase insert fails.

### Payments and Tickets

Supabase creation depends on successful Supabase booking insertion.

## Immediate Next Step

Create a fresh booking in the running production app and inspect the browser console.

The temporary diagnostics should reveal one of these exact causes:

1. `toSupabaseBooking()` returns `undefined`.
2. `customerId` is missing.
3. `showId` is missing.
4. Supabase insert is attempted but rejected.
5. Insert payload contains a field/type/enum mismatch.
6. Insert is blocked by table permissions or RLS.
7. Insert is blocked by a foreign key constraint.

## Recommended Next Fix Sequence

Do not proceed to more domain migrations until the Phase 2E booking insert failure is resolved.

Recommended order:

1. Capture the exact Supabase insert error from the browser console.
2. Fix only the failing booking insert cause.
3. Confirm a new booking appears in Supabase `bookings`.
4. Confirm matching `payments` and `tickets` rows are created.
5. Fix booking read fallback merge if needed so local-only fallback bookings remain visible during migration.
6. Remove temporary diagnostics once the issue is resolved.
7. Continue with communications migration.
8. Continue with lifecycle events and ticket validations.
9. Continue with waitlist and corporate requests.
10. Reintroduce RLS with proper policies.

## Not Yet Migrated

Still pending:

- Communications write/read migration.
- Communication batch persistence.
- Booking lifecycle event persistence.
- Ticket validation persistence.
- Waitlist persistence.
- Corporate request persistence.
- Show table and venue table operational persistence.
- Staff auth migration to Supabase Auth.
- RLS policy implementation.
- LocalStorage-to-Supabase one-time migration/import tooling.

## Production Readiness Notes

The app is not ready to remove localStorage fallback yet.

Supabase integration is underway but still hybrid. The critical blocker is proving that the full booking completion chain can persist:

Customer
→ Booking
→ Payment
→ Ticket

Once that chain is stable, the next safest migration target is communications, followed by lifecycle events and ticket validations.
