-- P0: the two-seater quota trigger consumes an override before inserting the
-- booking. Defer this one relationship check until the transaction completes,
-- when the new booking row is present. Any failed insert still rolls back the
-- override consumption and its audit event atomically.

alter table public.two_seater_limit_override_authorizations
  drop constraint if exists two_seater_limit_override_authorizations_booking_id_fkey;

alter table public.two_seater_limit_override_authorizations
  add constraint two_seater_limit_override_authorizations_booking_id_fkey
  foreign key (booking_id)
  references public.bookings(id)
  deferrable initially deferred;
