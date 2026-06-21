# Supabase Migration Progress

Last updated: 2026-06-21

## Current Status

The Supabase migration is complete through Phase 4. The database schema has been created in migration files, business data has been migrated behind Supabase-backed services, staff authentication and management are Supabase-backed, and all platform tables are protected behind service-role server routes with RLS hardening complete.

Migration status summary:

- Phase 1: Complete.
- Phase 2: Complete.
- Phase 3: Complete.
- Phase 4: Complete.
- Phase 5: Not Started.
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
- Supabase Auth: PASSED and TESTED.
- Staff Profiles & Roles: PASSED and TESTED.
- Staff Management: PASSED and TESTED.
- Staff Invitations: PASSED and TESTED.
- Admin Configuration Security: PASSED and TESTED.
- Booking Domain Security: PASSED and TESTED.
- Operational Domain Security: PASSED and TESTED.

Overall phase status:

- Phase 1 ✅ Complete
- Phase 2 ✅ Complete
- Phase 3 ✅ Complete
- Phase 4 ✅ Complete
- Phase 5 ⏳ Not Started

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

## Phase 3A: Supabase Auth

Status: PASSED and TESTED.

Service:

- `src/lib/supabase/auth.ts`

Implemented:

- Supabase Auth sign-in.
- Supabase Auth sign-out.
- Persistent Supabase session handling.
- Admin gate now uses authenticated Supabase session state.

Test results:

- Supabase Auth login succeeds.
- Existing admin login screen remains intact.
- Existing admin dashboard loads after authentication.
- Sign out clears the active admin session.

## Phase 3B: Staff Profiles & Roles

Status: PASSED and TESTED.

Services:

- `src/lib/supabase/staffProfiles.ts`

Implemented:

- Default role seeding support.
- Permission and role-permission seeding support.
- Staff profile creation/linkage for authenticated users.
- Admin session role display from `staff_profiles`.

Test results:

- Roles and permissions are available through Supabase.
- Authenticated staff profile is linked to Supabase Auth user.
- Existing Super Admin profile displays correctly in Admin.
- Staff role resolution works from `staff_profiles.role_id`.

## Phase 3C: Staff Management

Status: PASSED and TESTED.

Services:

- `src/lib/supabase/staffManagement.ts`

Implemented:

- Staff profile listing.
- Staff profile lookup.
- Staff role update.
- Staff active/inactive update.
- Staff profile delete service function.
- Settings → Staff management tab.

Test results:

- Staff list loads in Settings → Staff.
- Role changes save.
- Active toggle saves.
- Existing login still works.

## Phase 3D: Staff Invitations

Status: PASSED and TESTED.

Services:

- `src/lib/supabase/staffInvitations.ts`
- `src/app/api/admin/staff-invitations/route.ts`

Implemented:

- Super Admin staff creation UI in Settings → Staff.
- Supabase Auth user invitation/creation route.
- Linked `staff_profiles` creation.
- Role assignment during staff creation.
- Staff list refresh after creation.

Test results:

- Staff Invitations API uses configured service-role runtime key.
- Super Admin access validation reaches the server route.
- Create Staff User workflow is available from Settings → Staff.
- Staff profile creation path is linked to Supabase Auth users.

## Phase 4D1: Core Domain Read Routes

Status: PASSED and TESTED.

Implemented:

- Core booking-domain read operations moved behind server routes.
- Admin reads no longer require browser-side table access for the protected booking domain.

Routes:

- `src/app/api/admin/bookings/route.ts`
- `src/app/api/admin/customers/route.ts`
- `src/app/api/admin/tickets/route.ts`
- `src/app/api/admin/communications/route.ts`
- `src/app/api/admin/payments/route.ts`
- `src/app/api/admin/booking-lifecycle-events/route.ts`
- `src/app/api/admin/ticket-validations/route.ts`

Verification notes:

- Bookings load through server routes.
- Customers load through server routes.
- Tickets load through server routes.
- Communications load through server routes.

## Phase 4D2: Booking Transaction Flow

Status: PASSED and TESTED.

Implemented:

- Public booking creation moved to a single server-side transaction route.
- Booking creation no longer depends on browser-side multi-service writes.

Route:

- `src/app/api/bookings/route.ts`

Verification notes:

- Booking transaction route implemented.
- Customer created.
- Booking created.
- Payment created.
- Ticket created.
- Lifecycle event created.
- Communication created.

## Phase 4D3: Admin Mutations & Operational Actions

Status: PASSED and TESTED.

Implemented:

- Admin booking-domain write operations moved behind server routes.
- Operational updates use service-role route ownership instead of browser-side direct writes.

Routes:

- `src/app/api/admin/bookings/route.ts`
- `src/app/api/admin/payments/route.ts`
- `src/app/api/admin/tickets/route.ts`
- `src/app/api/admin/communications/route.ts`
- `src/app/api/admin/booking-lifecycle-events/route.ts`
- `src/app/api/admin/tickets/validate/route.ts`

Verification notes:

- Booking updates routed.
- Payment updates routed.
- Ticket updates routed.
- Communications routed.
- Lifecycle events routed.
- Ticket validation routed.

## Phase 4D3.5: Remaining Browser Write Removal

Status: PASSED and TESTED.

Implemented:

- Remaining direct browser-side writes for the core booking domain removed.
- Customer writes moved behind server routes.
- Corporate communication writes moved behind server routes.
- Browser-side booking persistence now routes through server APIs.

Verification notes:

- Remaining browser writes removed.
- Service-role routes own booking domain writes.

## Phase 4D4: Booking Domain RLS

Status: PASSED and TESTED.

Protected tables:

- `customers`
- `bookings`
- `payments`
- `tickets`
- `communications`
- `booking_lifecycle_events`
- `ticket_validations`

Implemented:

- RLS enabled for the booking domain.
- Browser access revoked for `anon` and `authenticated`.
- Service-role access retained through server routes.

Verification notes:

- RLS enabled.
- Browser access revoked.
- Service-role access retained.
- Booking flow verified.
- Admin reads verified.
- Validation verified.

## Phase 4E1: Waitlist Route Migration

Status: PASSED and TESTED.

Implemented:

- Waitlist table access moved behind server routes.
- Public waitlist signup now routes through `/api/waitlist`.
- Admin waitlist reads and status updates now route through `/api/admin/waitlist`.

Verification notes:

- Waitlist routes migrated.
- Service-role access granted.
- Waitlist create verified.
- Waitlist promote verified.
- Waitlist remove verified.
- `waitlist_entries` RLS enabled.

## Phase 4E2: Corporate Request Route Migration

Status: PASSED and TESTED.

Implemented:

- Corporate request table access moved behind server routes.
- Public corporate request submission now routes through `/api/corporate-requests`.
- Admin corporate request reads, updates, archive, delete, and conversion metadata now route through `/api/admin/corporate-requests`.

Verification notes:

- Corporate request routes migrated.
- Service-role access granted.
- Corporate request create verified.
- Status update verified.
- Archive verified.
- Delete verified.
- `corporate_requests` RLS enabled.

## Phase 4E3: Venue Table Security

Status: PASSED and TESTED.

Protected tables:

- `venue_tables`
- `show_tables`

Verification notes:

- `venue_tables` secured.
- `show_tables` secured.
- RLS enabled.
- Browser access revoked.

## Phase 4E4: Communication Batch Security

Status: PASSED and TESTED.

Protected table:

- `communication_batches`

Verification notes:

- `communication_batches` secured.
- RLS enabled.
- Browser access revoked.

## Supabase Permissions Status

Final security pattern:

- Admin configuration, booking-domain, and operational-domain tables are accessed through server routes where runtime access is required.
- Service-role routes own protected reads and writes.
- Browser-side direct access has been revoked for hardened tables.
- RLS is enabled for protected admin configuration, booking-domain, and operational-domain tables.

Completed protected areas:

- `roles`
- `permissions`
- `role_permissions`
- `staff_profiles`
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
- `venue_tables`
- `show_tables`
- `communication_batches`

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

Server-side booking transaction route is the primary write path.

Admin reads and writes route through service-role APIs.

### Payments and Tickets

Payments and tickets are created through the booking transaction route and maintained through admin service-role APIs.

### Communications

Supabase is primary, localStorage fallback remains.

### Lifecycle Events

Supabase is primary, localStorage fallback remains.

### Ticket Validations

Supabase is primary through server routes.

### Waitlist

Supabase is primary, localStorage fallback remains.

### Corporate Requests

Supabase is primary, localStorage fallback remains.

## Remaining Work

Phase 4 is complete.

Remaining work is limited to backlog and future production polish items listed below.

## SUPABASE MIGRATION COMPLETE

## SECURITY MIGRATION COMPLETE

Completed:

- Business Migration
- Auth & Roles
- Staff Management
- Staff Invitations
- Admin Configuration Security
- Booking Domain Security
- Operational Domain Security
- RLS Hardening

All platform tables secured.

Backlog:

- UX-001 Ticket Back Button
- UX-002 CRM Source Indicator
- UX-003 Customer Record vs Booking Snapshot View

## Production Readiness Notes

The Supabase migration is complete through Phase 4. Future production hardening should continue through controlled backlog work, operational QA, and any final localStorage fallback retirement decisions required before launch.
