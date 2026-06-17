# Supabase Phase 1 Migration Order

This phase creates the database structure only. It does not replace localStorage,
wire application pages to Supabase, or create Row Level Security policies.

## Migration Files

1. `migrations/202606170001_phase_1_core_schema.sql`

## Creation Order

1. Extensions and enums
   - Required before any enum-backed table columns can be created.

2. Auth-role structures
   - `roles`
   - `permissions`
   - `role_permissions`
   - `staff_profiles`
   - These reference `auth.users` and establish the future staff access model.

3. Core reference entities
   - `customers`
   - `shows`
   - `venue_tables`
   - These are parent records for booking, CRM, show, and table workflows.

4. Corporate intake
   - `corporate_requests`
   - Created before bookings so converted corporate requests can be linked later.

5. Per-show table state
   - `show_tables`
   - Depends on `shows` and `venue_tables`.

6. Bookings
   - `bookings`
   - Depends on `customers`, `shows`, `show_tables`, and optionally `corporate_requests`.

7. Circular operational links
   - Adds FK from `corporate_requests.linked_booking_id` to `bookings`.
   - Adds FK from `show_tables.booking_id` to `bookings`.

8. Booking-dependent records
   - `tickets`
   - `communication_batches`
   - `communications`
   - `communication_templates`
   - `waitlist_entries`
   - `payments`
   - `booking_lifecycle_events`
   - `ticket_validations`

9. Venue configuration
   - `venue_settings`
   - Stores future branding, operational settings, and venue-level configuration.

10. Indexes
   - Added after table creation for lookup, filtering, reporting, and relationship traversal.

## Future Local Storage Mapping

- `zingara-demo-bookings`
  - `bookings`
  - `payments`
  - `tickets`
  - `booking_lifecycle_events`
  - `communications`

- `zingara-demo-shows`
  - `shows`

- `zingara-demo-tables`
  - `venue_tables`
  - `show_tables`

- `zingara-demo-customer-crm`
  - `customers`
  - `communications`

- `zingara-demo-waitlist`
  - `waitlist_entries`

- `zingara-demo-corporate-requests`
  - `corporate_requests`

- `zingara-demo-communication-templates`
  - `communication_templates`

- `zingara-demo-venue-settings`
  - `venue_settings`

- `zingara-demo-staff-accounts`
  - `auth.users`
  - `staff_profiles`
  - `roles`
  - `permissions`

## Phase 1 Boundaries

- No RLS policies are implemented in this phase.
- No application pages are connected to Supabase in this phase.
- No localStorage migration script is implemented in this phase.
- No production notification, queue, or payment gateway infrastructure is implemented in this phase.
