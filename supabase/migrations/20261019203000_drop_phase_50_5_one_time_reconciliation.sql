-- The Phase 50.5 reconciliation has completed. Remove its one-time helper so
-- the Production schema retains only the ongoing integrity safeguards.
drop function if exists public.reconcile_verified_corporate_company_links_phase_50_5();
