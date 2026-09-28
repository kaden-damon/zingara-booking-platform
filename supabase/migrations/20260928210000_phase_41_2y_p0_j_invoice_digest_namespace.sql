-- Keep the reconciliation function's restricted search path while exposing
-- the existing pgcrypto digest helper used for immutable evidence checksums.
alter function public.reconcile_imported_booking_financials_atomic(
  text, timestamptz, numeric, numeric, text, numeric, numeric,
  text, uuid, uuid, text, text
) set search_path = public, extensions;
