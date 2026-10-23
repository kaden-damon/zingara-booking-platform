-- Keep the bounded conversion report's prior-session venue lookup index-backed.
create index if not exists platform_events_session_created_at_idx
  on public.platform_events (session_id, created_at desc)
  where session_id is not null;
