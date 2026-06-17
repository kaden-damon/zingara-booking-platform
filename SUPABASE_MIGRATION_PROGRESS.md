# Supabase Migration Progress

Last updated: 2026-06-17

## Current Status

The Supabase migration has completed the Phase 2 business-domain migration pass. The database schema has been created in migration files, and the application now has a shared Supabase data access layer for the operational business modules listed below. The app still keeps localStorage fallback behaviour while Phase 3 and Phase 4 remain pending.

Migration status summary:

- Shows: Business Migration Complete.
- Venue Settings: Business Migration Complete.
- Templates: Business Migration Complete.
- Customers: Business Migration Complete.
- Bookings: Business Migration Complete.
- Payments: Business Migration Complete.
- Tickets: Business Migration Complete.
- Communications: Business Migration Complete.
- Lifecycle Events: Business Migration Complete.
- Ticket Validations: Business Migration Complete.
- Waitlist: Business Migration Complete.
- Corporate Requests: Business Migration Complete.

Remaining work:

- Phase 3: Staff auth, roles, permissions, and production RLS policy implementation.
- Phase 4: Final localStorage retirement, one-time migration/import tooling, hardening, and production readiness cleanup.

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

Status: Business Migration Complete.

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

Status: Business Migration Complete.

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

Status: Business Migration Complete.

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

Status: Business Migration Complete.

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

Previously fixed:

- A show mapping issue prevented booking inserts when `booking.showId` did not resolve to `shows.id`.

## Phase 2E: Tickets and Payments

Status: Business Migration Complete.

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

Test result:

- Booking completion creates the booking, payment, and ticket records through the Supabase-backed persistence path while preserving localStorage fallback.

## Phase 2F: Communications

Status: Business Migration Complete.

Service:

- `src/lib/supabase/communications.ts`

Implemented:

- Communication read/write service.
- Booking communication history persistence.
- CRM communication history integration.
- Broadcast and corporate communication persistence.
- LocalStorage fallback.

## Phase 2G: Booking Lifecycle Events

Status: Business Migration Complete.

Service:

- `src/lib/supabase/lifecycleEvents.ts`

Implemented:

- Lifecycle event persistence for booking creation, confirmation, payment, refund, cancellation, check-in, and comp booking actions.
- Admin timeline loading from Supabase with localStorage fallback.

## Phase 2H: Ticket Validations

Status: Business Migration Complete.

Service:

- `src/lib/supabase/ticketValidations.ts`

Implemented:

- Ticket validation/check-in activity persistence.
- QR validation, duplicate scan, invalid ticket, and manual check-in activity tracking.
- LocalStorage fallback.

## Phase 2I: Waitlist

Status: PASSED and tested. Business Migration Complete.

Service:

- `src/lib/supabase/waitlist.ts`

Implemented:

- Waitlist read/write service.
- Waitlist signup persistence.
- Waitlist status updates, promotions, removals, and conversion persistence.
- LocalStorage fallback.

Test results:

- Waitlist entries save to Supabase.
- Waitlist entries load in Admin.
- Show selector added to Admin Waitlist.
- Promotion/removal/conversion paths functional.

## Phase 2J: Corporate Requests

Status: PASSED and tested. Business Migration Complete.

Service:

- `src/lib/supabase/corporateRequests.ts`

Implemented:

- Corporate request read/write service.
- Guest corporate request submission persistence.
- Admin corporate request management persistence.
- Status updates and request metadata persistence.
- LocalStorage fallback.

Test results:

- Corporate requests save to Supabase.
- Corporate requests load in Admin.
- Status changes persist.
- Corporate request conversion to booking confirmed.

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
- `communications`
- `booking_lifecycle_events`
- `ticket_validations`
- `waitlist_entries`
- `corporate_requests`

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

### Communications

Supabase is primary, localStorage fallback remains.

### Lifecycle Events

Supabase is primary, localStorage fallback remains.

### Ticket Validations

Supabase is primary, localStorage fallback remains.

### Waitlist

Supabase is primary, localStorage fallback remains.

### Corporate Requests

Supabase is primary, localStorage fallback remains.

## Remaining Work

Phase 3 and Phase 4 remain pending:

- Show table and venue table operational persistence.
- Staff auth migration to Supabase Auth.
- RLS policy implementation.
- LocalStorage-to-Supabase one-time migration/import tooling.

## Production Readiness Notes

The app is not ready to remove localStorage fallback yet.

Phase 2 business-domain migration is complete, but the platform remains hybrid until Phase 3 and Phase 4 are completed. Before production, RLS must be re-enabled with proper policies, staff/customer access must be routed through the final auth model, and localStorage fallback must be retired through a controlled migration/import process.
