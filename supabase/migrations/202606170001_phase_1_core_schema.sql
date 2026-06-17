create extension if not exists pgcrypto;

create type booking_status as enum (
  'new',
  'pending_payment',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled',
  'refunded',
  'no_show',
  'waitlisted'
);

create type payment_status as enum (
  'pending_payment',
  'deposit_paid',
  'fully_paid',
  'comp_vip',
  'cancelled',
  'refunded'
);

create type show_status as enum (
  'active',
  'inactive',
  'sold_out',
  'blackout',
  'venue_closure',
  'special_event',
  'archived'
);

create type communication_type as enum (
  'booking_confirmation',
  'reservation_pending',
  'reservation_confirmed',
  'complimentary_booking',
  'corporate_tentative_booking',
  'show_reminder',
  'payment_confirmation',
  'refund_notice',
  'operational_broadcast',
  'custom_message'
);

create type communication_channel as enum (
  'email',
  'sms',
  'whatsapp',
  'push',
  'internal_note'
);

create type ticket_status as enum (
  'issued',
  'valid',
  'checked_in',
  'cancelled',
  'refunded',
  'expired',
  'void'
);

create type table_status as enum (
  'available',
  'booked',
  'blocked',
  'disabled',
  'merged',
  'held',
  'unavailable'
);

create type waitlist_status as enum (
  'active',
  'contacted',
  'converted',
  'expired',
  'cancelled'
);

create type payment_type as enum (
  'deposit',
  'balance',
  'full_payment',
  'refund',
  'comp',
  'adjustment'
);

create type validation_result as enum (
  'valid',
  'checked_in',
  'cancelled',
  'invalid',
  'already_used',
  'refunded'
);

create type corporate_request_status as enum (
  'corporate_tentative',
  'quote_sent',
  'awaiting_acceptance',
  'awaiting_payment',
  'confirmed',
  'cancelled',
  'archived',
  'converted'
);

create type corporate_request_type as enum (
  'corporate_booking',
  'agent_contact'
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table staff_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role_id uuid references roles(id) on delete set null,
  active boolean not null default true,
  venue_scope text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  surname text,
  email text unique,
  mobile text,
  vip_status text,
  preferences jsonb not null default '{}'::jsonb,
  relationship_notes text,
  dietary_requirements text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table shows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  date date not null,
  time time not null,
  venue text not null,
  status show_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table venue_tables (
  id uuid primary key default gen_random_uuid(),
  table_code text not null unique,
  section text not null,
  capacity integer not null check (capacity > 0),
  base_status table_status not null default 'available',
  mergeable boolean not null default true,
  merge_group text,
  position jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table corporate_requests (
  id uuid primary key default gen_random_uuid(),
  request_type corporate_request_type not null default 'corporate_booking',
  status corporate_request_status not null default 'corporate_tentative',
  company_name text not null,
  contact_name text not null,
  contact_number text,
  email text,
  preferred_event_date date,
  alternative_event_date date,
  guest_count integer check (guest_count is null or guest_count > 0),
  seating_preference text,
  occasion text,
  other_description text,
  dietary_requirements text[] not null default '{}',
  other_dietary_requirement text,
  bar_tab text,
  addons text[] not null default '{}',
  notes text,
  source text not null default 'Corporate Direct',
  archived_at timestamptz,
  linked_booking_id uuid,
  linked_booking_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table show_tables (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references shows(id) on delete cascade,
  venue_table_id uuid references venue_tables(id) on delete set null,
  table_code text not null,
  section text not null,
  capacity integer not null check (capacity > 0),
  status table_status not null default 'available',
  booking_id uuid,
  merged_parent_id uuid references show_tables(id) on delete set null,
  merged_from uuid[] not null default '{}',
  override_notes text,
  is_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (show_id, table_code)
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete restrict,
  show_id uuid not null references shows(id) on delete restrict,
  table_id uuid references show_tables(id) on delete set null,
  corporate_request_id uuid references corporate_requests(id) on delete set null,
  booking_reference text not null unique,
  booking_source text not null default 'online',
  company_name text,
  guest_count integer not null check (guest_count > 0),
  booking_status booking_status not null default 'new',
  payment_status payment_status not null default 'pending_payment',
  section text,
  service_fee numeric(10,2) not null default 0,
  subtotal_amount numeric(10,2) not null default 0,
  discount_amount numeric(10,2) not null default 0,
  addons_total numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null default 0,
  amount_paid numeric(10,2) not null default 0,
  balance_outstanding numeric(10,2) not null default 0,
  notes text,
  dietary_requirements text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table corporate_requests
  add constraint corporate_requests_linked_booking_id_fkey
  foreign key (linked_booking_id) references bookings(id) on delete set null;

alter table show_tables
  add constraint show_tables_booking_id_fkey
  foreign key (booking_id) references bookings(id) on delete set null;

create table tickets (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  ticket_code text not null unique,
  ticket_url text,
  qr_payload text not null,
  ticket_status ticket_status not null default 'issued',
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table communication_batches (
  id uuid primary key default gen_random_uuid(),
  show_id uuid references shows(id) on delete set null,
  type communication_type not null,
  channel communication_channel not null,
  subject text,
  message text not null,
  recipient_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table communications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  booking_id uuid references bookings(id) on delete cascade,
  show_id uuid references shows(id) on delete set null,
  batch_id uuid references communication_batches(id) on delete set null,
  type communication_type not null,
  channel communication_channel not null,
  subject text,
  message text not null,
  status text not null default 'sent',
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table communication_templates (
  id uuid primary key default gen_random_uuid(),
  type communication_type not null,
  channel communication_channel not null,
  name text not null,
  subject text not null,
  body text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, channel, name)
);

create table waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  show_id uuid not null references shows(id) on delete cascade,
  desired_section text,
  guest_count integer not null check (guest_count > 0),
  status waitlist_status not null default 'active',
  converted_booking_id uuid references bookings(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  payment_type payment_type not null,
  payment_status payment_status not null,
  amount numeric(10,2) not null default 0,
  method text,
  reference text,
  notes text,
  processed_by uuid references auth.users(id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table booking_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  from_status booking_status,
  to_status booking_status not null,
  note text,
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table ticket_validations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  booking_id uuid not null references bookings(id) on delete cascade,
  validated_by uuid references auth.users(id) on delete set null,
  result validation_result not null,
  device_label text,
  notes text,
  validated_at timestamptz not null default now()
);

create table venue_settings (
  id uuid primary key default gen_random_uuid(),
  venue_key text not null unique,
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  branding jsonb not null default '{}'::jsonb,
  operational_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index staff_profiles_role_id_idx on staff_profiles(role_id);
create index staff_profiles_active_idx on staff_profiles(active);
create index customers_email_idx on customers(email);
create index customers_mobile_idx on customers(mobile);
create index customers_surname_idx on customers(surname);
create index shows_date_time_idx on shows(date, time);
create index shows_status_idx on shows(status);
create index shows_venue_idx on shows(venue);
create index venue_tables_section_idx on venue_tables(section);
create index venue_tables_table_code_idx on venue_tables(table_code);
create index corporate_requests_status_idx on corporate_requests(status);
create index corporate_requests_request_type_idx on corporate_requests(request_type);
create index corporate_requests_preferred_event_date_idx on corporate_requests(preferred_event_date);
create index corporate_requests_linked_booking_id_idx on corporate_requests(linked_booking_id);
create index show_tables_show_id_idx on show_tables(show_id);
create index show_tables_show_section_idx on show_tables(show_id, section);
create index show_tables_show_status_idx on show_tables(show_id, status);
create index show_tables_booking_id_idx on show_tables(booking_id);
create index bookings_customer_id_idx on bookings(customer_id);
create index bookings_show_id_idx on bookings(show_id);
create index bookings_table_id_idx on bookings(table_id);
create index bookings_reference_idx on bookings(booking_reference);
create index bookings_status_idx on bookings(booking_status);
create index bookings_payment_status_idx on bookings(payment_status);
create index bookings_source_idx on bookings(booking_source);
create index bookings_company_name_idx on bookings(company_name);
create index bookings_corporate_request_id_idx on bookings(corporate_request_id);
create index tickets_booking_id_idx on tickets(booking_id);
create index tickets_ticket_code_idx on tickets(ticket_code);
create index tickets_status_idx on tickets(ticket_status);
create index communication_batches_show_id_idx on communication_batches(show_id);
create index communication_batches_type_idx on communication_batches(type);
create index communication_batches_created_at_idx on communication_batches(created_at);
create index communications_customer_id_idx on communications(customer_id);
create index communications_booking_id_idx on communications(booking_id);
create index communications_show_id_idx on communications(show_id);
create index communications_batch_id_idx on communications(batch_id);
create index communications_type_idx on communications(type);
create index communications_sent_at_idx on communications(sent_at);
create index communication_templates_type_channel_idx on communication_templates(type, channel);
create index communication_templates_active_idx on communication_templates(active);
create index waitlist_entries_customer_id_idx on waitlist_entries(customer_id);
create index waitlist_entries_show_id_idx on waitlist_entries(show_id);
create index waitlist_entries_status_idx on waitlist_entries(status);
create index payments_booking_id_idx on payments(booking_id);
create index payments_status_idx on payments(payment_status);
create index payments_type_idx on payments(payment_type);
create index payments_processed_at_idx on payments(processed_at);
create index booking_lifecycle_events_booking_id_idx on booking_lifecycle_events(booking_id);
create index booking_lifecycle_events_to_status_idx on booking_lifecycle_events(to_status);
create index booking_lifecycle_events_created_at_idx on booking_lifecycle_events(created_at);
create index ticket_validations_ticket_id_idx on ticket_validations(ticket_id);
create index ticket_validations_booking_id_idx on ticket_validations(booking_id);
create index ticket_validations_result_idx on ticket_validations(result);
create index ticket_validations_validated_at_idx on ticket_validations(validated_at);
