-- Acceptance and audit evidence is append-only from the application boundary.
-- The database owner retains emergency recovery authority outside Zingara Admin.
revoke update, delete, truncate
  on table public.admin_policy_acceptances
  from service_role, authenticated, anon;

revoke update, delete, truncate
  on table public.audit_events
  from service_role, authenticated, anon;

comment on table public.admin_policy_acceptances is
  'Immutable, versioned Platform Use & Access Terms acceptance register.';
